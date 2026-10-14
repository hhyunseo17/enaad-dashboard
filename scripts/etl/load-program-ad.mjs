#!/usr/bin/env node
// ============================================================
// scripts/etl/load-program-ad.mjs
// CLI 진입점: program-ad의 data.xlsx(프로그램별 광고매출 + GRPs) → program_ad_sales upsert
// 사용법: node load-program-ad.mjs <data.xlsx 경로>
//
// 원본 구조(직접 확인, 2026-10-14):
// - 시트 'Sheet2'(월/채널/장르/프로그램 + 매출 5종 + GRPs 2종, 월×채널×프로그램 단위, 약 1.9만행).
//   '장르' 시트는 장르 세부분류 참고용이라 쓰지 않는다.
// - 월은 엑셀 시리얼 날짜(숫자) — XLSX.SSF.parse_date_code로 연/월만 뽑는다.
// - 장르가 비어 있으면(엑셀 빈 셀 → 0) '기타'. 채널이 비어 있으면 'ENA'(기존 app.js 규칙 그대로).
//
// 정제 규칙(cleanChannelName/cleanProgramName)은 기존 program-ad/app.js와 동일하다 — 그쪽 대시보드가
// 이 이름으로 집계해왔으므로 숫자가 바뀌면 안 된다. 정제 후 키 (연,월,채널,장르,프로그램)가 같아지는
// 행(실측 1,211건)은 합산한다. 독립 스크립트이며 배치/컷오버 없이 upsert만 한다.
// ============================================================
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHUNK_SIZE = 1000;
const SHEET_NAME = 'Sheet2';
const REQUIRED_HEADERS = ['월', '채널', '장르', '프로그램', '일반광고(패키지)', '일반광고(GRPs기여)', '인포머셜', 'IMC', '기타광고', 'GRPs(2049)', 'GRPs(가구)'];

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. .env.example을 참고해 .env를 만드세요.');
    process.exit(1);
  }
}

export function cleanChannelName(chName) {
  if (!chName) return 'ENA';
  const trimmed = String(chName).trim();
  const upper = trimmed.toUpperCase();
  if (upper === 'PLAY') return 'ENA PLAY';
  if (upper === 'STORY') return 'ENA STORY';
  if (upper === 'CHING(채널ING)') return 'CHING';
  if (upper === '헬스메디') return '헬스메디TV';
  return trimmed;
}

export function cleanProgramName(name) {
  let clean = String(name || '미지정').trim();
  clean = clean.replace(/<[^>]*>|\[[^\]]*\]|\([^)]*\)|（[^）]*）|〈[^〉]*〉/g, '');
  clean = clean.replace(/(스페셜|다시보기|몰아보기|본방송|재방송|하이라이트|패키지|특집|시즌\d*).*/gi, '');
  clean = clean.replace(/^[\s\-_:]+|[\s\-_:]+$/g, '').trim();
  if (/^나는\s*(SOLO|솔로).*그\s*후/i.test(clean) || /나솔사계/i.test(clean)) return '나는SOLO그후사랑은계속된다';
  if (/^나는\s*(SOLO|솔로)/i.test(clean)) return '나는SOLO';
  return clean || String(name).trim();
}

function parseNum(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

export function parseProgramAdWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
  if (!sheetName) throw new Error('data.xlsx에 시트가 없습니다.');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: 0 });
  if (rows.length === 0) throw new Error(`시트 "${sheetName}"에 데이터 행이 없습니다.`);

  const headers = Object.keys(rows[0]);
  const missing = REQUIRED_HEADERS.filter((c) => !headers.includes(c));
  if (missing.length > 0) throw new Error(`시트 "${sheetName}" 예상 컬럼 누락: ${missing.join(', ')}. 실제: ${headers.join(', ')}`);

  const groups = new Map();
  let skipped = 0;
  rows.forEach((r) => {
    const rawMonth = r['월'];
    let year; let month;
    if (typeof rawMonth === 'number') {
      const d = XLSX.SSF.parse_date_code(rawMonth);
      if (d) { year = d.y; month = d.m; }
    } else {
      const m = String(rawMonth).match(/(\d{4})[-./]?(\d{1,2})/);
      if (m) { year = Number(m[1]); month = Number(m[2]); }
    }
    if (!year || !month) { skipped++; return; }

    const channel = cleanChannelName(r['채널']);
    const genre = String(r['장르'] || '기타').trim();
    const program = cleanProgramName(r['프로그램']);
    const key = `${year}|${month}|${channel}|${genre}|${program}`;

    let g = groups.get(key);
    if (!g) {
      g = {
        year, month, channel, genre, program,
        rev_package: 0, rev_general_grps: 0, rev_infomercial: 0, rev_imc: 0, rev_other: 0,
        grp_2049: 0, grp_household: 0,
      };
      groups.set(key, g);
    }
    g.rev_package += parseNum(r['일반광고(패키지)']);
    g.rev_general_grps += parseNum(r['일반광고(GRPs기여)']);
    g.rev_infomercial += parseNum(r['인포머셜']);
    g.rev_imc += parseNum(r['IMC']);
    g.rev_other += parseNum(r['기타광고']);
    g.grp_2049 += parseNum(r['GRPs(2049)']);
    g.grp_household += parseNum(r['GRPs(가구)']);
  });
  return { sourceRows: rows.length, skipped, aggregated: Array.from(groups.values()) };
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
  const [filePath] = process.argv.slice(2);
  if (!filePath) {
    console.error('사용법: node load-program-ad.mjs <data.xlsx 경로>');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`[1/3] 읽는 중: ${filePath}`);
  const buffer = readFileSync(filePath);

  console.log('[2/3] 파싱 + 이름 정제 + 키별 합산');
  const { sourceRows, skipped, aggregated } = parseProgramAdWorkbook(buffer);
  console.log(`  원본 ${sourceRows}행 → 집계 ${aggregated.length}행${skipped ? ` (월 해석 실패 ${skipped}행 제외)` : ''}`);

  console.log('[3/3] program_ad_sales upsert');
  await upsertAll(supabase, 'program_ad_sales', aggregated, 'year,month,channel,genre,program');

  console.log(`완료. ${aggregated.length}행 upsert.`);
  console.log('주의: 파일에서 삭제/변경되어 사라진 과거 행(프로그램명 정제 결과가 바뀐 경우 포함)은 upsert만으로는 정리되지 않습니다. 필요 시 Supabase에서 수동 확인하세요.');
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('프로그램별 광고매출 적재 실패:', err.message);
    process.exit(1);
  });
}
