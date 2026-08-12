// ============================================================
// scripts/etl/validate.mjs
// 신규 배치 vs 직전 배치(current_batch가 가리키던 배치) diff 검증.
// run.mjs가 컷오버(current_batch 갱신) 직전에 호출한다 — 실패 시 컷오버를 막는다.
// ============================================================
import { classifyCategory } from './transform.mjs';
import { isBonbuNonExcluded } from './upfront-merge.mjs';

function categoryYearTotals(rows) {
  const totals = {};
  rows.filter(isBonbuNonExcluded).forEach((r) => {
    const cat = classifyCategory(r.category_original, r.sub_category);
    const key = `${r.year}||${cat}`;
    totals[key] = (totals[key] || 0) + (Number(r.amount_won) || 0);
  });
  return totals;
}

async function fetchAllRawRows(supabase, batchId) {
  const PAGE = 1000;
  let offset = 0;
  const out = [];
  for (;;) {
    const { data, error } = await supabase
      .from('raw_sales_rows')
      .select('year, category_original, sub_category, bonbu_revenue_status, amount_won')
      .eq('load_batch_id', batchId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`검증용 raw_sales_rows 조회 실패: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

// newRows: run.mjs가 메모리에 갖고 있는 이번 배치 파싱 결과(transform.mjs 출력, load_batch_id 없어도 됨)
export async function runValidation(supabase, { newBatchId, newRows }) {
  const { data: prevPointer } = await supabase.from('current_batch').select('batch_id').eq('id', 1).single();
  const prevBatchId = prevPointer ? prevPointer.batch_id : null;

  const summary = {
    newBatchId,
    prevBatchId,
    ok: true,
    warnings: [],
    rowCount: { new: newRows.length },
    categoryYearTotals: { diffs: [] },
  };

  const newTotals = categoryYearTotals(newRows);

  if (prevBatchId == null) {
    summary.warnings.push('직전 배치가 없어 diff 비교를 생략합니다 (최초 적재).');
    return summary;
  }

  const prevRows = await fetchAllRawRows(supabase, prevBatchId);
  summary.rowCount.prev = prevRows.length;
  summary.rowCount.diff = newRows.length - prevRows.length;

  const prevTotals = categoryYearTotals(prevRows);
  const allKeys = new Set([...Object.keys(newTotals), ...Object.keys(prevTotals)]);
  allKeys.forEach((key) => {
    const prevVal = prevTotals[key] || 0;
    const newVal = newTotals[key] || 0;
    if (prevVal !== newVal) {
      summary.categoryYearTotals.diffs.push({ key, prev: prevVal, new: newVal, diff: newVal - prevVal });
    }
  });

  // 안전판: 행 수가 직전 대비 30% 이상 급감하면 엑셀을 잘못 올렸을 가능성 → 컷오버 차단
  if (prevRows.length > 0 && newRows.length < prevRows.length * 0.7) {
    summary.ok = false;
    summary.warnings.push(`행 수가 직전 배치 대비 30% 이상 감소 (${prevRows.length} → ${newRows.length}). 잘못된 파일일 수 있습니다.`);
  }

  // 참고용 경고: 이미 마감된 과거 연도(작년 이전) 합계가 바뀌면 수기 정정 가능성이 있어 알림만 하고 차단하지는 않음
  const currentYear = new Date().getFullYear();
  summary.categoryYearTotals.diffs.forEach((d) => {
    const [year] = d.key.split('||');
    if (Number(year) < currentYear - 1) {
      summary.warnings.push(`마감된 것으로 추정되는 ${year}년 데이터가 변경됨: ${d.key} (${d.prev} → ${d.new})`);
    }
  });

  return summary;
}
