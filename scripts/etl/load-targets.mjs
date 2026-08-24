#!/usr/bin/env node
// ============================================================
// scripts/etl/load-targets.mjs
// CLI 진입점: target.xlsx `목표 합산` 시트 → sales_targets upsert
// 사용법: node load-targets.mjs <target.xlsx 경로>
//
// run.mjs(매출 ETL, addata.xlsx)와는 독립된 스크립트다. 배치/컷오버 개념이 없으므로
// current_batch를 건드리지 않고 sales_targets 테이블에 바로 upsert한다. 목표는 분기/반기
// 단위로 담당자가 이 스크립트를 재실행해 갱신한다.
// ============================================================
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { classifyCategory } from './transform.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHUNK_SIZE = 1000;
const SHEET_NAME = '목표 합산';
const VALID_CATEGORIES = new Set(['일반광고', 'IMC', '인포머셜', '큐톤광고', '기타광고']);
const BASIS_MAP = { '취급고': 'performance', '회계': 'accounting' };

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. .env.example을 참고해 .env를 만드세요.');
    process.exit(1);
  }
}

function s(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// 귀속월: "2023-01-01" 형태 텍스트(날짜 타입 아님) → split('-')로 연/월 추출.
// 혹시 엑셀이 실제 날짜 셀로 저장한 경우(raw:true라 Date 인스턴스나 시리얼 숫자로 올 수 있음)도 방어적으로 처리.
function parseYearMonth(val) {
  if (val instanceof Date) {
    return { year: val.getUTCFullYear(), month: val.getUTCMonth() + 1 };
  }
  if (typeof val === 'number') {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) return { year: parsed.y, month: parsed.m };
  }
  const str = s(val);
  const parts = str.split('-');
  if (parts.length < 2) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

export function readTargetRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`시트 '${SHEET_NAME}'을(를) 찾을 수 없습니다. 시트 목록: ${wb.SheetNames.join(', ')}`);
  }
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  const rows = [];
  jsonRows.forEach((r, idx) => {
    const targetRaw = r['목표'];
    if (targetRaw === null || targetRaw === undefined || targetRaw === '') return; // null 목표는 스킵(0은 유효)

    const manager = s(r['담당자']) || '(미지정)';
    const dept = s(r['부서']) || '(미지정)';
    const ym = parseYearMonth(r['귀속월']);
    if (!ym) {
      throw new Error(`${idx + 2}행: 귀속월 파싱 실패 (값: ${JSON.stringify(r['귀속월'])})`);
    }

    const basisRaw = s(r['매출기준']);
    const basis = BASIS_MAP[basisRaw];
    if (!basis) {
      throw new Error(`${idx + 2}행: 매출기준 값이 올바르지 않습니다 (값: ${JSON.stringify(r['매출기준'])}, 허용: 취급고/회계)`);
    }

    const categoryReclassified = classifyCategory(r['대분류'], '');
    if (!VALID_CATEGORIES.has(categoryReclassified)) {
      throw new Error(`${idx + 2}행: 재분류 결과가 5대분류 밖입니다 (원본 대분류: ${JSON.stringify(r['대분류'])}, 재분류 결과: ${categoryReclassified})`);
    }

    rows.push({
      manager,
      dept,
      category_reclassified: categoryReclassified,
      year: ym.year,
      month: ym.month,
      basis,
      target_amount_won: Math.round(Number(targetRaw) || 0),
    });
  });
  return mergeDuplicateKeys(rows);
}

// 재분류(예: 대행수익→기타광고) 결과 같은 (manager, category_reclassified, year, month, basis) 키로
// 합쳐지는 행이 있을 수 있다 — upsert 배치 안에서 같은 키가 두 번 나오면 Postgres가
// "ON CONFLICT DO UPDATE command cannot affect row a second time" 에러를 낸다.
// 원본이 서로 다른 대분류였을 뿐 재분류 후에는 같은 목표 버킷이므로 금액을 합산한다.
function mergeDuplicateKeys(rows) {
  const merged = new Map();
  rows.forEach(r => {
    const key = [r.manager, r.category_reclassified, r.year, r.month, r.basis].join('|');
    const existing = merged.get(key);
    if (existing) existing.target_amount_won += r.target_amount_won;
    else merged.set(key, { ...r });
  });
  return [...merged.values()];
}

async function upsertAll(supabase, rows) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('sales_targets').upsert(chunk, { onConflict: 'manager,category_reclassified,year,month,basis' });
    if (error) throw new Error(`sales_targets upsert 실패 (rows ${i}~${i + chunk.length}): ${error.message}`);
  }
}

async function main() {
  assertEnv();
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node load-targets.mjs <target.xlsx 경로>');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`[1/2] 엑셀 읽는 중: ${filePath}`);
  const buffer = readFileSync(filePath);
  const rows = readTargetRows(buffer);
  console.log(`  시트 '${SHEET_NAME}', ${rows.length}행 파싱 완료(널 목표 제외)`);

  console.log('[2/2] sales_targets upsert');
  await upsertAll(supabase, rows);

  console.log(`완료. ${rows.length}건 처리.`);
  console.log('주의: 파일에서 삭제/변경되어 사라진 과거 목표 행은 upsert만으로는 정리되지 않습니다. 필요 시 Supabase에서 수동 확인하세요.');
}

main().catch((err) => {
  console.error('목표 적재 실패:', err.message);
  process.exit(1);
});
