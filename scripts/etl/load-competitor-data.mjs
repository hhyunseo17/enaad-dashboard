#!/usr/bin/env node
// ============================================================
// scripts/etl/load-competitor-data.mjs
// CLI 진입점: File1(경쟁채널 지표 현황)/File2(매체별 광고비 raw) → competitor_ratings/competitor_revenue upsert
// 사용법: node load-competitor-data.mjs <File1.xlsx 경로> <File2.xlsx 경로>
//
// R2 바인딩이 이 Cloudflare Pages 프로젝트에서 원인 불명으로 전혀 붙지 않아(2026-09-15, TEST_BUCKET이라는
// 새 이름으로도 재현 확인) R2 프록시 경로를 포기하고 Supabase로 옮긴다. load-targets.mjs와 동일하게
// 배치/컷오버 없이 upsert만 한다 — 리포트 원본을 그대로 옮기는 것뿐이라 감사용 bronze/silver 분리가
// 필요 없다. 파싱 로직은 js/core/metrics-data-loader.js의 parseCompetitorRatingsWorkbook()/
// parseCompetitorRevenueWorkbook()을 그대로 이식(실 샘플로 이미 검증된 버전, 2026-09-15) — 그 파일을
// 고치면 이 파일도 같이 고칠 것(당장은 두 곳에 중복, 클라이언트가 R2 안 쓰게 되면 그 파일의 파싱 함수는
// 제거 예정이라 중복 기간은 짧다).
// ============================================================
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHUNK_SIZE = 1000;

const REVENUE_SHEET_NAME = '변환용';
const RATINGS_SHEET_NAME = '변환용취합';
const YM_COL_REGEX = /^(\d{4})-(\d{2})-\d{2}$/; // 실 샘플로 확인된 실제 헤더 형식 (YYYY-MM-01)
const RATINGS_MONTH_COLS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const RATINGS_CHANNEL_CANONICAL_MAP = { 'MBC 전국': 'MBC(전국)', 'SBS (민방포함)': 'SBS(민방포함)' };

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. .env.example을 참고해 .env를 만드세요.');
    process.exit(1);
  }
}

function normalizeChannelName(val) {
  return (val === null || val === undefined) ? '' : val.toString().trim();
}
function canonicalizeRatingsChannelName(val) {
  const name = normalizeChannelName(val);
  return RATINGS_CHANNEL_CANONICAL_MAP[name] || name;
}

export function parseCompetitorRevenueWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', sheets: [REVENUE_SHEET_NAME] });
  const sheet = wb.Sheets[REVENUE_SHEET_NAME];
  if (!sheet) throw new Error(`File2 "${REVENUE_SHEET_NAME}" 시트를 찾을 수 없습니다. 시트 목록: ${wb.SheetNames.join(', ')}`);
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  if (jsonRows.length === 0) throw new Error(`File2 "${REVENUE_SHEET_NAME}" 시트에 데이터 행이 없습니다.`);

  const firstRowKeys = Object.keys(jsonRows[0]);
  const requiredCols = ['채널', '사업자대분류', '사업자중분류', '채널그룹'];
  const missingCols = requiredCols.filter(c => !firstRowKeys.includes(c));
  if (missingCols.length > 0) throw new Error(`File2 예상 컬럼 누락: ${missingCols.join(', ')}. 실제: ${firstRowKeys.join(', ')}`);

  const ymCols = firstRowKeys.filter(k => YM_COL_REGEX.test(k));
  if (ymCols.length === 0) throw new Error('File2에서 "YYYY-MM-DD" 형식의 월별 매출 컬럼을 찾지 못했습니다.');

  const rows = [];
  jsonRows.forEach(r => {
    const channel = normalizeChannelName(r['채널']);
    if (!channel) return;
    const channelGroup = normalizeChannelName(r['채널그룹']) || channel;
    const operatorMajor = (r['사업자대분류'] || '').toString().trim();
    const operatorMid = (r['사업자중분류'] || '').toString().trim();

    ymCols.forEach(col => {
      const m = col.match(YM_COL_REGEX);
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      // File2 원본 수치는 백만원 단위다(실 샘플로 확인, 2026-09-15 — ENA 내부 매출 치환값(원 단위,
      // rawData.amount 기준)과 100만 배 차이가 나서 M/S가 KT ENA 100%로 나오는 버그의 원인이었다).
      // 이 코드베이스 전역 관례(rawData.amount·차트 /1e8 등)에 맞춰 여기서 원 단위로 통일한다.
      const revenue = Math.round((Number(r[col]) || 0) * 1000000);
      rows.push({ channel, operator_major: operatorMajor, operator_mid: operatorMid, channel_group: channelGroup, year, month, revenue });
    });
  });
  return rows;
}

export function parseCompetitorRatingsWorkbook(buffer) {
  // sheets 필터 필수 — File1에는 광고주Raw 등 수십만 행짜리 무관 시트가 같이 들어있어
  // 전체 파싱 시 OOM(46MB 파일 기준 힙 8GB로도 부족, 2026-09-22 실측)이 난다.
  const wb = XLSX.read(buffer, { type: 'buffer', sheets: [RATINGS_SHEET_NAME] });
  const sheet = wb.Sheets[RATINGS_SHEET_NAME];
  if (!sheet) throw new Error(`File1 "${RATINGS_SHEET_NAME}" 시트를 찾을 수 없습니다. 시트 목록: ${wb.SheetNames.join(', ')}`);
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  if (jsonRows.length === 0) throw new Error(`File1 "${RATINGS_SHEET_NAME}" 시트에 데이터 행이 없습니다.`);

  const firstRowKeys = Object.keys(jsonRows[0]);
  const requiredCols = ['연도', 'INDEX', '구분', '채널'];
  const missingCols = requiredCols.filter(c => !firstRowKeys.includes(c));
  if (missingCols.length > 0) throw new Error(`File1 예상 컬럼 누락: ${missingCols.join(', ')}. 실제: ${firstRowKeys.join(', ')}`);

  const rows = [];
  jsonRows.forEach(r => {
    const year = parseInt(r['연도'], 10);
    if (!year) return;
    const indexMode = (r['INDEX'] || '').toString().trim();
    const rawGubun = (r['구분'] || '').toString().trim();
    if (!rawGubun) return;
    const codeMatch = rawGubun.match(/^(\d+)\./);
    const metricCode = codeMatch ? codeMatch[1] : '';
    // 02(채널별 광고매출)는 File2로 대체하지만, 01(방송사업자 광고매출)은 이제 그대로 적재한다 —
    // "사업자 비교" 모드의 매출은 File2 채널그룹 합산이 아니라 File1이 직접 보고하는 사업자 단위
    // 수치를 쓰기로 함(2026-09-15, 사용자 요청). 단위는 다른 지표와 동일하게 변환 없이 그대로 저장
    // (백만원, File1 원본) — 쓰는 쪽(js/core/metrics-data-loader.js)에서 ×1,000,000 해서 원 단위로 맞춘다.
    if (metricCode === '02') return;
    const metricLabel = codeMatch ? rawGubun.slice(codeMatch[0].length).trim() : rawGubun;
    const channel = canonicalizeRatingsChannelName(r['채널']);
    if (!channel) return;

    RATINGS_MONTH_COLS.forEach(col => {
      if (!(col in r) || r[col] === '') return;
      const value = Number(r[col]);
      if (isNaN(value)) return;
      rows.push({ year, index_mode: indexMode, metric_code: metricCode, metric_label: metricLabel, channel, month: parseInt(col, 10), value });
    });
  });
  return rows;
}

async function upsertAll(supabase, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert 실패 (rows ${i}~${i + chunk.length}): ${error.message}`);
  }
}

// ------------------------------------------------------------
// 리포트 "as of" 날짜 (File1 내부 "{연도}년" 시트 H2 셀)
//
// 2026-09-16, 사용자 확인: File1 안에 연도별 시트("26년" 등)가 있고 그 H2 셀에 리포트 발행 기준일이
// 적혀 있다. "최신 데이터가 있는 연/월"(metric_code='01' 기준 latest row, renderMetricsDataAsOfLabel의
// 기존 계산)과는 다른 개념 — 전자는 "이 리포트가 언제자 기준으로 작성됐는지", 후자는 "그 안에 몇 월치
// 실적까지 채워져 있는지"다. 시트명이 연도에 따라 바뀌므로("26년"→"27년"→"28년") 하드코딩하지 않고,
// RATINGS_SHEET_NAME("변환용취합")을 파싱해 얻은 연도들의 최댓값으로 동적으로 구성한다(시스템 시계는
// 신뢰하지 않는다 — 파일이 실제로 몇 년도 데이터까지 담고 있는지가 기준).
// ------------------------------------------------------------

function determineMaxYear(ratingsRows) {
  if (!ratingsRows.length) return null;
  return ratingsRows.reduce((max, r) => (r.year > max ? r.year : max), ratingsRows[0].year);
}

// transform.mjs의 parseDateFull과 동일한 패턴(Date 객체 → 숫자 시리얼(XLSX.SSF.parse_date_code) →
// 문자열 정규식 폴백) — H2가 실제 Excel 날짜 타입인지, 텍스트("2026-09-10"/"20260910"/"26.9.10")인지
// 알 수 없어 셋 다 방어적으로 처리한다. **문자열 정규식은 시작(^) 앵커를 쓰지 않는다** — 실 샘플로
// 확인한 값이 "Updated : 2026-09-10"처럼 라벨 접두어가 붙어 있었다(2026-09-16, 사용자 스크린샷) —
// 앵커가 있으면 이 접두어 때문에 매칭 자체가 실패한다. 문자열 어디에 있든 날짜 패턴만 찾는다.
function parseAsOfDateValue(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, '0')}-${String(raw.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d || 1).padStart(2, '0')}`;
  }
  const str = String(raw).trim();
  let m = str.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);        // "Updated : 2026-09-10" / 2026.9.10 / 2026/09/10
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = str.match(/(?:^|\D)(\d{8})(?:\D|$)/);                        // 20260910(앞뒤가 숫자가 아닌 경우만 — 다른 8자리 숫자와 혼동 방지)
  if (m) { const s = m[1]; return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; }
  m = str.match(/(\d{2})[-./](\d{1,2})[-./](\d{1,2})/);            // 26.9.10 (2자리 연도)
  if (m) return `20${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

// 이 함수는 절대 던지지 않는다(호출부에서 try/catch 불필요) — 실패하면 경고만 남기고 null을 돌려줘
// 나머지 15개 지표 적재를 막지 않는다(README의 source_file_modified_at 폴백과 같은 태도).
function parseReportAsOfDate(buffer, maxYear) {
  if (!maxYear) {
    console.warn('[경쟁채널 지표 as-of 날짜] 파싱된 ratings 행이 없어 연도를 알 수 없습니다 — 건너뜁니다.');
    return null;
  }
  const sheetName = `${maxYear % 100}년`;
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, sheets: [sheetName] });
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      console.warn(`[경쟁채널 지표 as-of 날짜] "${sheetName}" 시트를 찾을 수 없습니다(시트 목록: ${wb.SheetNames.join(', ')}) — 이 값 없이 계속 진행합니다.`);
      return null;
    }
    // H2 하나만 보지 않고 H1~H3을 순서대로 시도한다(실 샘플로 확인, 2026-09-16 — H2가 맞았다).
    // **원본 셀의 서식 문자열(cell.w)을 원시값(cell.v)보다 먼저 쓴다** — 실 샘플에서 H2의 raw
    // Date는 "2026-09-09T14:59:08.000Z"였는데(시각 성분이 낀 일련값 — NOW()류 수식으로 만들어진
    // 값으로 보인다), Excel 서식이 이를 "Updated : 2026/09/10"으로 표시했다. cell.v를 UTC 기준으로
    // 그대로 해석하면 이 시각 성분 때문에 정확히 하루 어긋난다(사용자가 화면에서 실제로 보는 날짜와
    // 다름) — 사람이 Excel에서 읽는 그대로(cell.w)가 진실이므로 이걸 우선한다.
    const candidates = ['H1', 'H2', 'H3'];
    for (const addr of candidates) {
      const cell = sheet[addr];
      if (!cell) continue;
      const parsed = (cell.w && parseAsOfDateValue(cell.w)) || (cell.v !== undefined && cell.v !== null && cell.v !== '' ? parseAsOfDateValue(cell.v) : null);
      if (parsed) return parsed;
      console.warn(`[경쟁채널 지표 as-of 날짜] "${sheetName}"!${addr} 값(w="${cell.w}", v="${cell.v}")을 날짜로 해석하지 못했습니다 — 다음 후보를 확인합니다.`);
    }
    console.warn(`[경쟁채널 지표 as-of 날짜] "${sheetName}"!H1~H3에서 날짜를 찾지 못했습니다 — 이 값 없이 계속 진행합니다.`);
    return null;
  } catch (err) {
    console.warn(`[경쟁채널 지표 as-of 날짜] 읽기 실패(무시하고 계속 진행): ${err.message}`);
    return null;
  }
}

async function main() {
  assertEnv();
  const [ratingsPath, revenuePath] = process.argv.slice(2);
  if (!ratingsPath || !revenuePath) {
    console.error('사용법: node load-competitor-data.mjs <File1(경쟁채널 지표 현황).xlsx> <File2(매체별 광고비 raw).xlsx>');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`[1/5] File1 읽는 중: ${ratingsPath}`);
  const ratingsBuffer = readFileSync(ratingsPath);
  const ratingsRows = parseCompetitorRatingsWorkbook(ratingsBuffer);
  console.log(`  ${ratingsRows.length}행 파싱 완료`);

  console.log('[2/5] competitor_ratings upsert');
  await upsertAll(supabase, 'competitor_ratings', ratingsRows, 'year,index_mode,metric_code,channel,month');

  console.log('[3/5] 리포트 as-of 날짜(File1 "{연도}년" 시트 H2) 확인 후 competitor_ratings_meta upsert');
  const maxYear = determineMaxYear(ratingsRows);
  const reportAsOfDate = parseReportAsOfDate(ratingsBuffer, maxYear);
  if (reportAsOfDate) {
    const { error } = await supabase.from('competitor_ratings_meta')
      .upsert({ id: 1, report_as_of_date: reportAsOfDate, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) console.error(`  competitor_ratings_meta upsert 실패(무시하고 계속): ${error.message}`);
    else console.log(`  report_as_of_date=${reportAsOfDate} 적재 완료`);
  } else {
    console.warn('  report_as_of_date를 얻지 못해 competitor_ratings_meta 갱신을 건너뜁니다(기존 값 유지, 프론트는 폴백 표시로 대체됨).');
  }

  // File2(매체별 광고비 raw)는 더 이상 지표 대시보드가 쓰지 않는다(js/core/metrics-data-loader.js
  // 헤더 주석 참고 — File1 하나로 통일됐다, 2026-09-16). competitor_revenue는 롤백 안전망으로만
  // 남겨둔 legacy 테이블이라, 이 파일을 못 읽거나 형식이 바뀌어도(실측: "변환용" 시트가 없고
  // "Sheet1"만 있는 파일이 전달된 적이 있다) ratings/as-of-date 적재를 절대 막으면 안 된다 — 그래서
  // 이 둘(critical path)보다 뒤에서, 실패해도 무시하고 넘어가는 구조로 돌린다.
  console.log(`[4/5] File2 읽는 중(레거시 롤백용, 실패해도 계속 진행): ${revenuePath}`);
  let revenueRowCount = 0;
  try {
    const revenueRows = parseCompetitorRevenueWorkbook(readFileSync(revenuePath));
    console.log(`  ${revenueRows.length}행 파싱 완료`);
    revenueRowCount = revenueRows.length;
    console.log('[5/5] competitor_revenue upsert');
    await upsertAll(supabase, 'competitor_revenue', revenueRows, 'channel,year,month');
  } catch (err) {
    console.warn(`  File2 처리 실패(무시하고 계속 진행 — competitor_ratings/competitor_ratings_meta는 이미 반영됨): ${err.message}`);
  }

  console.log(`완료. ratings ${ratingsRows.length}건, revenue ${revenueRowCount}건 처리.`);
  console.log('주의: 파일에서 삭제/변경되어 사라진 과거 행은 upsert만으로는 정리되지 않습니다. 필요 시 Supabase에서 수동 확인하세요.');
}

main().catch((err) => {
  console.error('경쟁채널 지표 적재 실패:', err.message);
  process.exit(1);
});
