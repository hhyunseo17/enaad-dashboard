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
  const wb = XLSX.read(buffer, { type: 'buffer' });
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
  const wb = XLSX.read(buffer, { type: 'buffer' });
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

async function main() {
  assertEnv();
  const [ratingsPath, revenuePath] = process.argv.slice(2);
  if (!ratingsPath || !revenuePath) {
    console.error('사용법: node load-competitor-data.mjs <File1(경쟁채널 지표 현황).xlsx> <File2(매체별 광고비 raw).xlsx>');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`[1/4] File1 읽는 중: ${ratingsPath}`);
  const ratingsRows = parseCompetitorRatingsWorkbook(readFileSync(ratingsPath));
  console.log(`  ${ratingsRows.length}행 파싱 완료`);

  console.log(`[2/4] File2 읽는 중: ${revenuePath}`);
  const revenueRows = parseCompetitorRevenueWorkbook(readFileSync(revenuePath));
  console.log(`  ${revenueRows.length}행 파싱 완료`);

  console.log('[3/4] competitor_ratings upsert');
  await upsertAll(supabase, 'competitor_ratings', ratingsRows, 'year,index_mode,metric_code,channel,month');

  console.log('[4/4] competitor_revenue upsert');
  await upsertAll(supabase, 'competitor_revenue', revenueRows, 'channel,year,month');

  console.log(`완료. ratings ${ratingsRows.length}건, revenue ${revenueRows.length}건 처리.`);
  console.log('주의: 파일에서 삭제/변경되어 사라진 과거 행은 upsert만으로는 정리되지 않습니다. 필요 시 Supabase에서 수동 확인하세요.');
}

main().catch((err) => {
  console.error('경쟁채널 지표 적재 실패:', err.message);
  process.exit(1);
});
