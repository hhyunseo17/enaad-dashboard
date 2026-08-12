// ============================================================
// scripts/etl/upfront-merge.mjs
// 업프론트 계약 중복 병합("K2그룹" 등, data-loader.js:220-258 이식).
// 그룹핑→기간비교→sweep 병합은 절차적 로직이라 SQL VIEW로 표현 불가 — 여기서 실행한 결과만
// upfront_contracts 테이블에 저장한다.
// ============================================================

// 매출 미인식 사전 필터(data-loader.js:128-136)와 동일 조건. 병합 대상은 본부매출+비제외 행만.
export function isBonbuNonExcluded(row) {
  if (row.category_original === '교환광고') return false;
  if (row.category_original === '대행수익' && row.sub_category !== 'skylife큐톤') return false;
  return row.bonbu_revenue_status === '본부매출';
}

// rows: raw_sales_rows에서 조회한 행 배열. 각 행은 최소한 다음 필드를 가져야 한다:
// id, category_original, sub_category, bonbu_revenue_status, is_upfront,
// upfront_contract_amount_eok, gross_net_flag, upfront_advertiser_raw, upfront_note,
// contract_start_y, contract_start_m, contract_end_y, contract_end_m
export function mergeUpfrontContracts(rows) {
  const eligible = rows.filter(
    (r) => isBonbuNonExcluded(r) && r.is_upfront && r.contract_start_y && r.contract_end_y
  );

  // 1차: 광고주(업프론트용)+계약기간 기준 유일 그룹 (업프론트 비고에 "합산"이 있으면 그것을 우선 키로 사용)
  const contractMap = {};
  eligible.forEach((r) => {
    const contractAmountWon = Math.round((r.upfront_contract_amount_eok || 0) * 1e8);
    const groupAdv = r.upfront_note && r.upfront_note.includes('합산') ? r.upfront_note : r.upfront_advertiser_raw;
    const key = `${groupAdv}||${r.contract_start_y}-${r.contract_start_m}||${r.contract_end_y}-${r.contract_end_m}`;
    if (!contractMap[key]) {
      contractMap[key] = {
        advertiser: r.upfront_advertiser_raw,
        groupKey: groupAdv,
        start: { y: r.contract_start_y, m: r.contract_start_m },
        end: { y: r.contract_end_y, m: r.contract_end_m },
        amountWon: contractAmountWon,
        hasNet: false,
        rowIds: [],
      };
    }
    if (r.gross_net_flag === 'NET') contractMap[key].hasNet = true;
    contractMap[key].rowIds.push(r.id);
  });

  // 2차: 같은 그룹키+같은 계약금액이 겹치는 기간으로 여러 번 등재된 경우(계약 갱신/재기재) sweep으로 병합
  const byAdvText = {};
  Object.values(contractMap).forEach((g) => {
    const k = `${g.groupKey}||${g.amountWon}`;
    if (!byAdvText[k]) byAdvText[k] = [];
    byAdvText[k].push(g);
  });

  const mergedGroups = [];
  Object.values(byAdvText).forEach((list) => {
    list.sort((a, b) => a.start.y * 12 + a.start.m - (b.start.y * 12 + b.start.m));
    let current = null;
    list.forEach((g) => {
      const gs = g.start.y * 12 + g.start.m;
      const ge = g.end.y * 12 + g.end.m;
      if (!current) {
        current = { advertiser: g.advertiser, groupKey: g.groupKey, amountWon: g.amountWon, hasNet: g.hasNet, sIdx: gs, eIdx: ge, rowIds: [...g.rowIds] };
        return;
      }
      if (gs <= current.eIdx) {
        current.eIdx = Math.max(current.eIdx, ge);
        current.hasNet = current.hasNet || g.hasNet;
        current.rowIds.push(...g.rowIds);
      } else {
        mergedGroups.push(current);
        current = { advertiser: g.advertiser, groupKey: g.groupKey, amountWon: g.amountWon, hasNet: g.hasNet, sIdx: gs, eIdx: ge, rowIds: [...g.rowIds] };
      }
    });
    if (current) mergedGroups.push(current);
  });

  return mergedGroups
    .map((g) => {
      const totalMonths = g.eIdx - g.sIdx + 1;
      const start = { y: Math.floor((g.sIdx - 1) / 12), m: ((g.sIdx - 1) % 12) + 1 };
      const end = { y: Math.floor((g.eIdx - 1) / 12), m: ((g.eIdx - 1) % 12) + 1 };
      return {
        advertiser: g.advertiser,
        group_key: g.groupKey,
        start_year: start.y,
        start_month: start.m,
        end_year: end.y,
        end_month: end.m,
        has_net: g.hasNet,
        target_amount_won: g.amountWon,
        total_months: totalMonths,
        source_raw_row_ids: g.rowIds,
      };
    })
    .filter((c) => c.total_months > 0 && c.target_amount_won > 0);
}
