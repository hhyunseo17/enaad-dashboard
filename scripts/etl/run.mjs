#!/usr/bin/env node
// ============================================================
// scripts/etl/run.mjs
// CLI 진입점: 엑셀 → raw_sales_rows 적재 → 업프론트 병합 → 검증 → (통과 시) current_batch 컷오버
// 사용법: node run.mjs <addata.xlsx 경로>
// ============================================================
import 'dotenv/config';
import { readFileSync, statSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { readWorkbookRows } from './transform.mjs';
import { mergeUpfrontContracts } from './upfront-merge.mjs';
import { runValidation } from './validate.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHUNK_SIZE = 1000;

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. .env.example을 참고해 .env를 만드세요.');
    process.exit(1);
  }
}

async function bulkInsert(supabase, table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert 실패 (rows ${i}~${i + chunk.length}): ${error.message}`);
  }
}

// PostgREST/Supabase 기본 응답은 1000행으로 제한되므로 .range()로 끝까지 페이지네이션한다.
async function selectAll(supabase, table, columns, filters) {
  const out = [];
  let offset = 0;
  for (;;) {
    let q = supabase.from(table).select(columns);
    Object.entries(filters).forEach(([col, val]) => { q = q.eq(col, val); });
    const { data, error } = await q.range(offset, offset + CHUNK_SIZE - 1);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    out.push(...data);
    if (data.length < CHUNK_SIZE) break;
    offset += CHUNK_SIZE;
  }
  return out;
}

async function main() {
  assertEnv();
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node run.mjs <addata.xlsx 경로>');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`[1/6] 엑셀 읽는 중: ${filePath}`);
  const buffer = readFileSync(filePath);
  const { sheetName, modifiedDate, rows } = readWorkbookRows(buffer);
  console.log(`  시트 '${sheetName}', ${rows.length}행 파싱 완료`);
  // 엑셀 내부 메타데이터(wb.Props.ModifiedDate)가 없을 때가 있다 — Google Drive를 거쳐
  // 내려받는 과정(DRM 우회 워크플로우, scripts/etl/README.md 참고)에서 유실되는 것으로 보인다.
  // 그 경우 로컬 파일의 실제 수정 시각(fs mtime)으로 대체한다.
  const fileModifiedAt = modifiedDate ? new Date(modifiedDate) : statSync(filePath).mtime;

  console.log('[2/6] 배치 등록');
  const { data: batch, error: batchErr } = await supabase
    .from('etl_load_batches')
    .insert({
      source_file_name: filePath.split(/[\\/]/).pop(),
      source_file_modified_at: fileModifiedAt.toISOString(),
      row_count: rows.length,
      loaded_by: process.env.USER || process.env.USERNAME || 'unknown',
      status: 'loading',
    })
    .select('id')
    .single();
  if (batchErr) throw new Error(`배치 등록 실패: ${batchErr.message}`);
  const batchId = batch.id;
  console.log(`  batch_id = ${batchId}`);

  console.log('[3/6] raw_sales_rows 적재');
  await bulkInsert(supabase, 'raw_sales_rows', rows.map((r) => ({ ...r, load_batch_id: batchId })));

  console.log('[4/6] 방금 적재한 행의 id 재조회 (업프론트 병합에 필요)');
  const insertedRows = await selectAll(
    supabase,
    'raw_sales_rows',
    'id, category_original, sub_category, bonbu_revenue_status, is_upfront, upfront_contract_amount_eok, gross_net_flag, upfront_advertiser_raw, upfront_note, contract_start_y, contract_start_m, contract_end_y, contract_end_m',
    { load_batch_id: batchId }
  );
  console.log(`  ${insertedRows.length}행 재조회 완료`);

  console.log('[5/6] 업프론트 계약 병합(K2 로직) + 적재');
  const contracts = mergeUpfrontContracts(insertedRows).map((c) => ({ ...c, load_batch_id: batchId }));
  await bulkInsert(supabase, 'upfront_contracts', contracts);
  console.log(`  병합 결과 ${contracts.length}건`);

  await supabase.from('etl_load_batches').update({ status: 'loaded' }).eq('id', batchId);

  console.log('[6/6] 검증(직전 배치 대비 diff)');
  const summary = await runValidation(supabase, { newBatchId: batchId, newRows: rows });
  await supabase
    .from('etl_load_batches')
    .update({ status: summary.ok ? 'validated' : 'failed', validation_summary: summary })
    .eq('id', batchId);

  if (summary.warnings.length > 0) {
    console.warn('경고:');
    summary.warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  if (!summary.ok) {
    console.error('검증 실패 — current_batch를 갱신하지 않습니다(컷오버 취소). 위 경고를 확인하세요.');
    process.exit(1);
  }

  console.log('검증 통과 — current_batch 컷오버');
  const { data: prevPointer } = await supabase.from('current_batch').select('batch_id').eq('id', 1).single();
  const prevBatchId = prevPointer ? prevPointer.batch_id : null;
  const { error: cutoverErr } = await supabase.from('current_batch').update({ batch_id: batchId }).eq('id', 1);
  if (cutoverErr) throw new Error(`컷오버 실패: ${cutoverErr.message}`);
  if (prevBatchId) {
    await supabase.from('etl_load_batches').update({ status: 'superseded' }).eq('id', prevBatchId);
  }

  console.log(`완료. batch_id=${batchId}가 현재 배치입니다. (이전 배치 batch_id=${prevBatchId}는 롤백용으로 보존)`);
}

main().catch((err) => {
  console.error('ETL 실패:', err.message);
  process.exit(1);
});
