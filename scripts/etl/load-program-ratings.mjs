#!/usr/bin/env node
// ============================================================
// scripts/etl/load-program-ratings.mjs
// CLI 진입점: program-ratings.xlsx(회차 단위 시청률 원본) → program_ratings_monthly upsert
// 사용법: node load-program-ratings.mjs <program-ratings.xlsx 경로>
//
// 지표 대시보드에 새 차트(장르별 1%↑ 시청률 프로그램 수)를 추가하기 위한 데이터 소스.
// competitor_ratings(File1, 월별 집계 리포트)와는 완전히 다른 원본이다 — 이쪽은 회차 단위
// (약 259K행)라 그대로 브라우저에 내려주기엔 너무 크므로, 여기서 (채널,프로그램,장르,연,월)
// 키로 월별 집계해서 rating_sum/episode_count만 저장한다. load-competitor-data.mjs/
// load-targets.mjs와 동일하게 배치/컷오버 없는 독립 스크립트(upsert만).
//
// 원본 구조(직접 확인, 2026-09-17):
// - 시트 이름이 "0916"처럼 매번 바뀐다 — wb.SheetNames[0]을 그대로 쓴다(시트 1개뿐 확인).
// - 실제 헤더 행은 "채널"이 A열에 정확히 일치하는 행 — 하드코딩된 행 번호(현재는 5번째 행) 대신
//   이 값을 찾아 그 다음 행부터 데이터로 취급한다(다음 주부터 레이아웃이 살짝 바뀔 수 있음).
// - 헤더: 채널/프로그램/본방유무/일자/시작시간/종료시간/방영길이/장르/개인2049.
// - 일자는 엑셀 시리얼 날짜(숫자) — XLSX.SSF.parse_date_code로 연/월만 뽑는다(다른 ETL 스크립트가
//   day-only 날짜를 다룰 때 쓰는 관례, load-competitor-data.mjs의 parseAsOfDateValue 참고).
// - 본방유무: "본방"|"재방" — 재방은 버린다(사용자 확정, 2026-09-17: 재방은 시청률이 구조적으로
//   낮아 프로그램 성과를 왜곡함).
// - 장르 8종 전부 저장(드라마&영화/오락/정보/스포츠/어린이(유아)/교육/보도/기타) — 지금 차트는
//   프론트에서 2개만 필터링해서 쓰지만 향후 확장 대비로 전부 적재.
// - 채널·프로그램 조합 중 극소수(약 1.2%)가 월에 따라 장르값이 다르게 찍혀 있으나, 별도 보정 없이
//   원본 그대로 (채널,프로그램,장르,연,월) 키로 그룹핑한다(과도한 엔지니어링 금지 — 사용자 확정).
// ============================================================
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHUNK_SIZE = 1000;

const REQUIRED_HEADERS = ['채널', '프로그램', '본방유무', '일자', '장르', '개인2049'];

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. .env.example을 참고해 .env를 만드세요.');
    process.exit(1);
  }
}

// 엑셀 시리얼 날짜(숫자) → { year, month }. XLSX.SSF.parse_date_code를 쓴다(1900 윤년 버그 등을
// 라이브러리가 이미 처리해줌 — 수동 계산보다 안전).
function serialToYearMonth(serial) {
  const n = Number(serial);
  if (!n || Number.isNaN(n)) return null;
  const parsed = XLSX.SSF.parse_date_code(n);
  if (!parsed) return null;
  return { year: parsed.y, month: parsed.m };
}

// "채널"이 A열(첫 컬럼)에 정확히 일치하는 행을 찾아 그 행을 헤더로, 다음 행부터 데이터로 취급한다.
// 하드코딩된 행 번호(현재 관측: 5번째 행, index 4) 대신 이 탐지 방식을 쓴다 — 시트/레이아웃이
// 다음 주부터 살짝 바뀔 수 있다는 사용자 확인 사항 반영.
function findHeaderRowIndex(matrix) {
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (row && String(row[0] ?? '').trim() === '채널') return i;
  }
  return -1;
}

export function parseProgramRatingsWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('program-ratings.xlsx에 시트가 없습니다.');
  const sheet = wb.Sheets[sheetName];

  // 헤더 행 탐지를 위해 우선 배열(행렬) 형태로 전체를 읽는다.
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  const headerRowIdx = findHeaderRowIndex(matrix);
  if (headerRowIdx === -1) throw new Error(`시트 "${sheetName}"에서 "채널" 헤더 행을 찾지 못했습니다.`);

  const headers = matrix[headerRowIdx].map((h) => String(h ?? '').trim());
  const missing = REQUIRED_HEADERS.filter((c) => !headers.includes(c));
  if (missing.length > 0) throw new Error(`예상 컬럼 누락: ${missing.join(', ')}. 실제 헤더: ${headers.join(', ')}`);

  const col = Object.fromEntries(headers.map((h, i) => [h, i]));
  const dataRows = matrix.slice(headerRowIdx + 1);

  const rawRows = [];
  dataRows.forEach((row) => {
    if (!row || row.length === 0) return;
    const channel = String(row[col['채널']] ?? '').trim();
    if (!channel) return; // 빈 줄 방어
    const airType = String(row[col['본방유무']] ?? '').trim();
    if (airType !== '본방') return; // 재방은 전부 버린다(사용자 확정)

    const program = String(row[col['프로그램']] ?? '').trim();
    const genre = String(row[col['장르']] ?? '').trim();
    const ym = serialToYearMonth(row[col['일자']]);
    const rating = Number(row[col['개인2049']]);

    if (!program || !genre || !ym || Number.isNaN(rating)) return;
    rawRows.push({ channel, program, genre, year: ym.year, month: ym.month, rating });
  });
  return rawRows;
}

// (channel, program, genre, year, month) 키로 그룹핑해 rating_sum/episode_count 산출.
export function aggregateMonthly(rawRows) {
  const groups = new Map();
  rawRows.forEach((r) => {
    const key = `${r.channel}|${r.program}|${r.genre}|${r.year}|${r.month}`;
    const g = groups.get(key);
    if (g) {
      g.rating_sum += r.rating;
      g.episode_count += 1;
    } else {
      groups.set(key, {
        channel: r.channel, program: r.program, genre: r.genre,
        year: r.year, month: r.month, rating_sum: r.rating, episode_count: 1,
      });
    }
  });
  return Array.from(groups.values());
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
    console.error('사용법: node load-program-ratings.mjs <program-ratings.xlsx 경로>');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`[1/4] 읽는 중: ${filePath}`);
  const buffer = readFileSync(filePath);

  console.log('[2/4] 파싱 + 본방 필터링');
  const rawRows = parseProgramRatingsWorkbook(buffer);
  console.log(`  본방 필터링 후 ${rawRows.length}행`);

  console.log('[3/4] (채널,프로그램,장르,연,월) 기준 월별 집계');
  const monthlyRows = aggregateMonthly(rawRows);
  console.log(`  집계 후 ${monthlyRows.length}행`);

  console.log('[4/4] program_ratings_monthly upsert');
  await upsertAll(supabase, 'program_ratings_monthly', monthlyRows, 'channel,program,genre,year,month');

  console.log(`완료. 원본 ${rawRows.length}행(본방만) → 집계 ${monthlyRows.length}행 upsert.`);
  console.log('주의: 파일에서 삭제/변경되어 사라진 과거 행은 upsert만으로는 정리되지 않습니다. 필요 시 Supabase에서 수동 확인하세요.');
}

main().catch((err) => {
  console.error('프로그램 시청률 적재 실패:', err.message);
  process.exit(1);
});
