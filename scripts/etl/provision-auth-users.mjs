#!/usr/bin/env node
// ============================================================
// scripts/etl/provision-auth-users.mjs
// name.xlsx(부서/성명/직책/ID·이메일 + 탭 권한 3컬럼) → Supabase Auth 계정 + profiles 생성·갱신.
// run.mjs와 무관한 독립 실행 — 인원/권한 변동 시 수동으로 재실행한다(기존 계정의 비밀번호는 건드리지 않음).
// 사용법: node provision-auth-users.mjs <name.xlsx 경로> [--dry-run]
//   --dry-run: 계정 생성·profiles 갱신을 하지 않고 "무엇이 바뀔지"만 출력한다. 권한 컬럼을 처음 채운
//              뒤나 대량 수정 뒤에는 반드시 먼저 돌려볼 것.
//
// 탭 권한 컬럼(2026-10-14, 사용자 확정): `매출` / `지표` / `프로그램` 세 컬럼에 볼 수 있는 탭만 O로 표시한다.
// - 세 컬럼이 **모두 있으면** 각 행의 allowed_tabs를 그 표시대로 덮어쓴다. 빈 칸·X는 "권한 없음"이므로
//   기존 사용자의 `매출`/`지표`에도 O를 채우지 않으면 그 사람은 접근을 잃는다(회수가 파일에 그대로 표현되는
//   대신 생기는 함정 — 그래서 --dry-run이 있다).
// - 세 컬럼이 **하나도 없으면** allowed_tabs는 건드리지 않는다(기존 동작과 동일). 일부만 있으면 오타일
//   가능성이 커서 중단한다.
// - O/X 외의 값이 섞인 행은 그 사람의 권한을 바꾸지 않고 경고만 한다(오타로 일부만 부여/회수되는 것 방지).
// 서버가 강제하는 키는 sales/metrics/programAd(supabase/schema.sql 11절, shared/supabase-proxy.mjs의
// requireTabAccess)다.
// ============================================================
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INITIAL_PASSWORD = process.env.PROVISION_INITIAL_PASSWORD;

const TAB_COLUMNS = [
  { header: '매출', key: 'sales' },
  { header: '지표', key: 'metrics' },
  { header: '프로그램', key: 'programAd' },
];
// 숫자 0은 일부러 어느 쪽에도 넣지 않는다 — 알파벳 O와 모양이 같아서 "O를 쓰려다 0을 친" 입력이 조용히
// "권한 없음"으로 처리되면 전원 접근이 끊긴다(2026-10-14 실제로 발생). 그래서 0은 해석 불가로 두고 경고한다.
const GRANT_MARKS = new Set(['o', '○', '◯', 'ㅇ', 'y', 'yes', 'true', '1', '✓', '✔']);
const DENY_MARKS = new Set(['', 'x', '×', '✕', 'n', 'no', 'false', '-']);

function assertEnv(dryRun) {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!dryRun && !INITIAL_PASSWORD) missing.push('PROVISION_INITIAL_PASSWORD'); // dry-run은 계정을 안 만들어 불필요
  if (missing.length > 0) {
    console.error(`다음 환경변수가 필요합니다: ${missing.join(', ')} (.env.example 참고)`);
    process.exit(1);
  }
}

function normalizeHeader(h) {
  return String(h || '').trim();
}

// 셀 → 'grant' | 'deny' | 'unknown'. boolean(엑셀 체크박스/TRUE)과 숫자 1/0도 받는다.
function readMark(cell) {
  const s = String(cell ?? '').trim().toLowerCase();
  if (GRANT_MARKS.has(s)) return 'grant';
  if (DENY_MARKS.has(s)) return 'deny';
  return 'unknown';
}

function readRoster(filePath) {
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const headers = new Set(raw.length ? Object.keys(raw[0]).map(normalizeHeader) : []);
  const present = TAB_COLUMNS.filter((c) => headers.has(c.header));
  if (present.length > 0 && present.length < TAB_COLUMNS.length) {
    const absent = TAB_COLUMNS.filter((c) => !headers.has(c.header)).map((c) => c.header);
    throw new Error(`탭 권한 컬럼이 일부만 있습니다(없는 컬럼: ${absent.join(', ')}). 매출/지표/프로그램 세 컬럼을 모두 두거나 모두 빼세요.`);
  }
  const managesTabs = present.length === TAB_COLUMNS.length;

  const roster = raw
    .map((row) => {
      const entries = Object.fromEntries(Object.entries(row).map(([k, v]) => [normalizeHeader(k), v]));
      const person = {
        dept: String(entries['부서'] || '').trim(),
        name: String(entries['성명'] || '').trim(),
        position: String(entries['직책'] || '').trim(),
        email: String(entries['ID/이메일'] || '').trim().toLowerCase(),
        tabs: null,         // null이면 allowed_tabs를 건드리지 않는다
        badTabCells: [],    // O/X로 해석 못 한 셀 — 있으면 이 사람 권한은 바꾸지 않는다
      };
      if (managesTabs) {
        const tabs = [];
        TAB_COLUMNS.forEach(({ header, key }) => {
          const mark = readMark(entries[header]);
          if (mark === 'grant') tabs.push(key);
          else if (mark === 'unknown') person.badTabCells.push(`${header}="${String(entries[header]).trim()}"`);
        });
        if (person.badTabCells.length === 0) person.tabs = tabs;
      }
      return person;
    })
    .filter((r) => r.email);

  return { roster, managesTabs };
}

const sameSet = (a, b) => a.length === b.length && a.every((t) => b.includes(t));
const fmtTabs = (tabs) => (tabs.length ? tabs.join(',') : '(없음)');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filePath = args.find((a) => !a.startsWith('--'));
  if (!filePath) {
    console.error('사용법: node provision-auth-users.mjs <name.xlsx 경로> [--dry-run]');
    process.exit(1);
  }
  assertEnv(dryRun);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`명단 읽는 중: ${filePath}${dryRun ? '  [DRY-RUN — 아무것도 반영하지 않습니다]' : ''}`);
  const { roster, managesTabs } = readRoster(filePath);
  console.log(`${roster.length}명 확인 — 탭 권한 컬럼: ${managesTabs ? '있음(파일 기준으로 덮어씀)' : '없음(allowed_tabs는 건드리지 않음)'}`);

  // 목록을 한 번만 받아 이메일로 찾는다(인원이 많아도 왕복 1회).
  const { data: listed, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`listUsers 실패: ${listErr.message}`);
  const idByEmail = new Map(listed.users.map((u) => [(u.email || '').toLowerCase(), u.id]));

  const { data: profileRows, error: profErr } = await supabase.from('profiles').select('id, allowed_tabs');
  if (profErr) throw new Error(`profiles 조회 실패: ${profErr.message}`);
  const tabsById = new Map(profileRows.map((p) => [p.id, p.allowed_tabs || []]));

  let changed = 0;
  let lostAccess = 0;
  for (const person of roster) {
    let userId = idByEmail.get(person.email) || null;
    const isNew = !userId;

    if (person.badTabCells.length > 0) {
      const zeroHint = person.badTabCells.some((c) => /="0"$/.test(c)) ? ' (숫자 0이 아니라 알파벳 O인지 확인)' : '';
      console.error(`  [권한 건너뜀] ${person.email}: 해석할 수 없는 값 ${person.badTabCells.join(', ')} — O 또는 X(빈 칸)만 허용${zeroHint}`);
    }

    // 지표 탭은 프론트가 매출 권한도 요구한다(ENA 매출 치환에 매출 데이터가 필요 — js/core/auth.js).
    // 지표만 Y면 서버는 허용하지만 화면에서는 탭이 열리지 않으므로 의도한 설정인지 알린다.
    if (person.tabs && person.tabs.includes('metrics') && !person.tabs.includes('sales')) {
      console.warn(`  [주의] ${person.email}: 지표만 Y(매출 N) — 지표 탭은 매출 권한이 있어야 열립니다. 매출도 Y로 하세요.`);
    }

    // 권한 변화 계산(dry-run·실제 실행 공통으로 출력)
    const before = userId ? tabsById.get(userId) || ['sales', 'metrics'] : null;
    let tabNote = '';
    if (person.tabs) {
      if (isNew) tabNote = ` → 탭 ${fmtTabs(person.tabs)}`;
      else if (!sameSet(before, person.tabs)) {
        tabNote = ` → 탭 ${fmtTabs(before)} ⇒ ${fmtTabs(person.tabs)}`;
        changed++;
        if (before.some((t) => !person.tabs.includes(t))) lostAccess++;
      }
    }

    if (dryRun) {
      console.log(`  [${isNew ? '신규' : '기존'}] ${person.email} (${person.dept}/${person.name})${tabNote}`);
      continue;
    }

    if (isNew) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: person.email,
        password: INITIAL_PASSWORD,
        email_confirm: true,
        user_metadata: { name: person.name, position: person.position, dept: person.dept },
      });
      if (error) {
        console.error(`  [실패] ${person.email}: ${error.message}`);
        continue;
      }
      userId = data.user.id;
      console.log(`  [생성] ${person.email} (${person.dept}/${person.name})${tabNote}`);
    } else {
      console.log(`  [기존] ${person.email} — Auth 계정 유지, profiles만 갱신${tabNote}`);
    }

    const profile = { id: userId, email: person.email, dept: person.dept };
    if (person.tabs) profile.allowed_tabs = person.tabs;
    const { error: profileErr } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
    if (profileErr) console.error(`  [profiles 실패] ${person.email}: ${profileErr.message}`);
  }

  if (managesTabs) {
    console.log(`\n탭 권한 변경 ${changed}명${lostAccess ? ` — 그중 기존 접근을 잃는 사람 ${lostAccess}명(의도한 회수인지 확인하세요)` : ''}`);
  }
  console.log(dryRun
    ? '\nDRY-RUN 종료 — 반영된 것은 없습니다. 내용이 맞으면 --dry-run 없이 다시 실행하세요.'
    : '\n완료. 초기 비밀번호는 전원 공통값 — 로그인 후 개인 비밀번호로 교체를 안내할 것.');
}

main().catch((err) => {
  console.error('provisioning 실패:', err.message);
  process.exit(1);
});
