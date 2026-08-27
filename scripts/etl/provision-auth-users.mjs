#!/usr/bin/env node
// ============================================================
// scripts/etl/provision-auth-users.mjs
// 1회성 스크립트: name.xlsx(부서/성명/직책/ID·이메일) → Supabase Auth 계정 + profiles 생성.
// run.mjs와 무관한 독립 실행 — 인원 변동 시 수동으로 재실행한다(기존 계정은 건드리지 않고 건너뜀).
// 사용법: node provision-auth-users.mjs <name.xlsx 경로>
// ============================================================
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INITIAL_PASSWORD = process.env.PROVISION_INITIAL_PASSWORD;

function assertEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!INITIAL_PASSWORD) missing.push('PROVISION_INITIAL_PASSWORD');
  if (missing.length > 0) {
    console.error(`다음 환경변수가 필요합니다: ${missing.join(', ')} (.env.example 참고)`);
    process.exit(1);
  }
}

function normalizeHeader(h) {
  return String(h || '').trim();
}

function readRoster(filePath) {
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return raw
    .map((row) => {
      const entries = Object.fromEntries(Object.entries(row).map(([k, v]) => [normalizeHeader(k), v]));
      return {
        dept: String(entries['부서'] || '').trim(),
        name: String(entries['성명'] || '').trim(),
        position: String(entries['직책'] || '').trim(),
        email: String(entries['ID/이메일'] || '').trim().toLowerCase(),
      };
    })
    .filter((r) => r.email);
}

async function findUserIdByEmail(supabase, email) {
  // supabase-js admin API에 getUserByEmail이 없어 목록에서 직접 찾는다(30명 내외라 페이지네이션 불필요).
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers 실패: ${error.message}`);
  const found = data.users.find((u) => (u.email || '').toLowerCase() === email);
  return found ? found.id : null;
}

async function main() {
  assertEnv();
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node provision-auth-users.mjs <name.xlsx 경로>');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`명단 읽는 중: ${filePath}`);
  const roster = readRoster(filePath);
  console.log(`${roster.length}명 확인`);

  for (const person of roster) {
    let userId = await findUserIdByEmail(supabase, person.email);

    if (!userId) {
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
      console.log(`  [생성] ${person.email} (${person.dept}/${person.name})`);
    } else {
      console.log(`  [기존] ${person.email} — Auth 계정 유지, profiles만 갱신`);
    }

    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert({ id: userId, email: person.email, dept: person.dept }, { onConflict: 'id' });
    if (profileErr) {
      console.error(`  [profiles 실패] ${person.email}: ${profileErr.message}`);
    }
  }

  console.log('완료. 초기 비밀번호는 전원 공통값 — 로그인 후 개인 비밀번호로 교체를 안내할 것.');
}

main().catch((err) => {
  console.error('provisioning 실패:', err.message);
  process.exit(1);
});
