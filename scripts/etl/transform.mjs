// ============================================================
// scripts/etl/transform.mjs
// 엑셀 `변환` 시트 행 → raw_sales_rows 컬럼으로 정규화.
// data-loader.js:141-285(parseMonthValue/parseDateToYM/parseDateFull/classifyCategory)를
// Node(xlsx 패키지)로 그대로 이식한 것 — SSF 날짜 파싱은 브라우저 SheetJS와 동일 라이브러리라
// 파싱 결과가 일치한다.
// ============================================================
import XLSX from 'xlsx';

function s(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function parseMonthValue(val) {
  if (val === null || val === undefined || val === '') return '2025-01';
  if (val instanceof Date) return `${val.getUTCFullYear()}-${String(val.getUTCMonth() + 1).padStart(2, '0')}`;
  if (typeof val === 'number') {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
  }
  const str = String(val).trim();
  if (str.length >= 7 && str.includes('-')) return str.substring(0, 7);
  return str || '2025-01';
}

export function parseDateToYM(val) {
  if (!val) return null;
  if (val instanceof Date) return { y: val.getUTCFullYear(), m: val.getUTCMonth() + 1 };
  if (typeof val === 'number') {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) return { y: parsed.y, m: parsed.m };
  }
  const str = String(val).trim();
  const dm = str.match(/^(\d{4})[-./](\d{1,2})/);
  if (dm) return { y: parseInt(dm[1], 10), m: parseInt(dm[2], 10) };
  return null;
}

export function parseDateFull(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const p = XLSX.SSF.parse_date_code(val);
    if (p) return new Date(Date.UTC(p.y, p.m - 1, p.d || 1));
  }
  const str = String(val).trim();
  const dm = str.match(/^(\d{4})[-./](\d{1,2})[-./]?(\d{0,2})/);
  if (dm) return new Date(Date.UTC(parseInt(dm[1], 10), parseInt(dm[2], 10) - 1, dm[3] ? parseInt(dm[3], 10) : 1));
  return null;
}

// classifyCategory(data-loader.js:278-285) — SQL 뷰(v_sales_normalized)에도 동일 로직이 있다.
// 여기 있는 이유는 validate.mjs가 "브라우저 baseline"과 동일한 기준으로 카테고리별 합계를 검증해야
// 하기 때문 — SQL과 JS 두 구현을 별도로 유지보수해야 하니, 규칙이 바뀌면 양쪽(schema.sql, 이 함수) 모두 수정할 것.
export function classifyCategory(rawCat, rawSub) {
  rawCat = s(rawCat);
  rawSub = s(rawSub);
  const lowerSub = rawSub.toLowerCase();
  if (rawCat === '일반광고') return '일반광고';
  if (rawCat === '인포머셜') return '인포머셜';
  if (rawCat === 'IMC') return 'IMC';
  if (rawCat === '큐톤광고' || lowerSub.includes('skylife')) return '큐톤광고';
  if (['기타광고', '어드레서블', '콘텐츠편성', '기타수익', 'ARA', '대행수익'].includes(rawCat) || rawSub === '자사큐톤' || rawSub === '티온애드') return '기타광고';
  return rawCat || '기타광고';
}

export function transformRow(r, sourceRowNo) {
  const monthStr = parseMonthValue(r['귀속월']);
  const year = parseInt(monthStr.split('-')[0], 10) || 2025;
  const month = parseInt(monthStr.split('-')[1], 10) || 1;

  const advertiser = s(r['광고주']) || '(미지정)';
  const contractStartYM = parseDateToYM(r['계약시작일']);
  const contractEndYM = parseDateToYM(r['계약종료일']);
  const contractStartDate = parseDateFull(r['계약시작일']);
  const contractEndDate = parseDateFull(r['계약종료일']);

  return {
    source_row_no: sourceRowNo,
    month_str: monthStr,
    year,
    month,
    dept: s(r['부서']) || '(미지정)',
    manager: s(r['담당자']) || '(미지정)',
    advertiser,
    agency_raw: s(r['대행사']) || '(미지정)',
    agency_group_raw: s(r['대행사그룹']) || s(r['대행사 그룹']) || s(r['대행사']) || '(미지정)',
    channel_raw: s(r['채널']) || s(r['매체']) || '(미지정)',
    industry: s(r['업종대분류']) || '(미지정)',
    industry_mid: s(r['업종중분류']) || '(미지정)',
    industry_sub: s(r['업종소분류']) || '(미지정)',
    broad_digital: s(r['방송디지털']) || s(r['방송/디지털']) || '기타',
    category_original: s(r['대분류']) || '기타',
    sub_category: s(r['중분류']) || '(미지정)',
    sub_category3: s(r['소분류']),
    one_n_flag: s(r['1/N여부']),
    revenue_basis: s(r['매출기준']) || '실적',
    bonbu_revenue_status: s(r['본부매출여부']),
    remark: r['비고'] !== undefined && r['비고'] !== null ? String(r['비고']) : null,
    amount_won: Math.round(Number(r['금액']) || 0), // 엑셀 부동소수 오차(예: 2077143.9999999998) 보정 — bigint 컬럼
    is_upfront: s(r['업프론트']) === '업프론트',
    contract_start_y: contractStartYM ? contractStartYM.y : null,
    contract_start_m: contractStartYM ? contractStartYM.m : null,
    contract_end_y: contractEndYM ? contractEndYM.y : null,
    contract_end_m: contractEndYM ? contractEndYM.m : null,
    contract_start_date: contractStartDate ? contractStartDate.toISOString().slice(0, 10) : null,
    contract_end_date: contractEndDate ? contractEndDate.toISOString().slice(0, 10) : null,
    upfront_contract_amount_eok: parseFloat(r['업프론트 계약금액']) || 0,
    gross_net_flag: s(r['GROSS/NET']),
    upfront_advertiser_raw: s(r['광고주(업프론트용)']) || advertiser,
    upfront_note: s(r['업프론트 비고']),
  };
}

// 워크북 버퍼 → { sheetName, modifiedDate, rows } (rows는 raw_sales_rows insert 페이로드, load_batch_id 제외)
export function readWorkbookRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  let targetSheetName = wb.SheetNames.find(name => name.includes('변환'));
  if (!targetSheetName) targetSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[targetSheetName];
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const modifiedDate = wb.Props && wb.Props.ModifiedDate ? wb.Props.ModifiedDate : null;
  return {
    sheetName: targetSheetName,
    modifiedDate,
    // 엑셀 1행=헤더이므로 실제 데이터는 2행부터 — 디버깅 시 원본 대조용
    rows: jsonRows.map((r, idx) => transformRow(r, idx + 2)),
  };
}
