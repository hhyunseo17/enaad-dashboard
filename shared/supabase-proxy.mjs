// ============================================================
// shared/supabase-proxy.mjs
// Supabase REST(PostgREST) 프록시 공용 로직. worker.js(standalone Worker 배포용)와
// functions/api/*.js(Cloudflare Pages Functions 배포용, 이 프로젝트가 실제로 쓰는 경로)가
// 함께 쓴다 — 로직을 두 벌로 유지하지 않기 위해 여기 하나만 둔다.
//
// env에는 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 있어야 한다(Worker secret 또는
// Pages 환경변수). service_role key만 사용하고 anon key는 발급하지 않는다 — 브라우저는
// 이 프록시(Worker 또는 Pages Functions, 둘 다 Zero Trust로 보호되는 도메인)만 호출한다.
// ============================================================

// PostgREST 기본 max-rows(1000)보다 크게 요청하려면 Supabase 프로젝트 설정(Settings → API → Max Rows)도
// 이 값 이상으로 올려야 한다 — 설정만 올리고 클라이언트 요청 limit을 그대로 두면 여전히 1000행씩 잘린다.
// 현재 데이터가 26,000행대이므로 30,000으로 잡으면 보통 1페이지로 끝난다.
const SUPABASE_PAGE_SIZE = 30000;
const PAGE_CONCURRENCY = 4; // 데이터가 더 늘어나 여러 페이지가 필요해지는 경우를 대비한 안전판(순차 대기 방지)

function authHeaders(env, withExactCount) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  if (withExactCount) headers.Prefer = 'count=exact'; // Content-Range 헤더에 총 행수를 실어달라는 요청
  return headers;
}

function pageUrl(env, viewName, offset) {
  return `${env.SUPABASE_URL}/rest/v1/${viewName}?select=*&limit=${SUPABASE_PAGE_SIZE}&offset=${offset}`;
}

async function assertOk(res, viewName) {
  if (!res.ok) {
    const text = await res.text();
    // Supabase 원본 응답 본문은 브라우저로 그대로 돌려보내지 않는다(내부 쿼리/스키마 정보 노출 방지).
    // 상세는 서버 로그(wrangler tail 또는 Pages Functions 로그)로만 남긴다.
    console.error(`Supabase 조회 실패(${viewName}): HTTP ${res.status} ${text}`);
    throw new Error(`upstream_error:${viewName}`);
  }
}

// Content-Range 예: "0-999/26320"(count=exact 요청 시) 또는 "0-999/*"(요청 안 했을 때). 후자는 null 반환.
function parseTotalFromContentRange(res) {
  const cr = res.headers.get('content-range');
  if (!cr) return null;
  const totalStr = cr.split('/')[1];
  if (!totalStr || totalStr === '*') return null;
  return parseInt(totalStr, 10);
}

async function fetchPageJson(env, viewName, offset) {
  const res = await fetch(pageUrl(env, viewName, offset), { headers: authHeaders(env, false) });
  await assertOk(res, viewName);
  return res.json();
}

// 뷰 전체를 프록시 응답으로 반환한다.
//
// 데이터가 한 페이지(SUPABASE_PAGE_SIZE) 안에 다 들어오는 게 확인되면(count=exact로 총 행수 확인),
// Supabase 응답 바디를 JSON으로 파싱했다가 다시 문자열로 만드는 과정 없이 그대로 스트리밍 전달한다 —
// 26,000행 규모에서 이 파싱+재직렬화 비용이 로딩 시간의 상당 부분을 차지했다(체감 3초 이상).
// count=exact를 못 받아오는 경우(total === null)에는 정확성을 위해 마지막 페이지가 다 안 찰 때까지
// 순차 조회하는 방식으로 안전하게 폴백한다. 데이터가 자라서 여러 페이지가 필요해지면 알고 있는
// 총 행수만큼 나머지를 병렬로 채운다.
export async function proxyView(env, viewName) {
  const firstRes = await fetch(pageUrl(env, viewName, 0), { headers: authHeaders(env, true) });
  await assertOk(firstRes, viewName);
  const total = parseTotalFromContentRange(firstRes);

  if (total !== null && total <= SUPABASE_PAGE_SIZE) {
    // 흔한 경우: 한 페이지로 전체 커버 — 파싱 없이 그대로 흘려보낸다.
    return new Response(firstRes.body, {
      headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': 'private, no-cache' },
    });
  }

  const firstPage = await firstRes.json();
  const all = [...firstPage];

  if (total !== null) {
    // 총 행수를 아니까 나머지 페이지 offset을 미리 계산해 병렬로 조회.
    const offsets = [];
    for (let offset = SUPABASE_PAGE_SIZE; offset < total; offset += SUPABASE_PAGE_SIZE) offsets.push(offset);
    for (let i = 0; i < offsets.length; i += PAGE_CONCURRENCY) {
      const batch = offsets.slice(i, i + PAGE_CONCURRENCY);
      const pages = await Promise.all(batch.map((offset) => fetchPageJson(env, viewName, offset)));
      pages.forEach((page) => all.push(...page));
    }
  } else if (firstPage.length === SUPABASE_PAGE_SIZE) {
    // count=exact를 못 받은 경우(total 불명) — 마지막 페이지가 다 안 찰 때까지 순차 조회(안전한 폴백).
    let offset = SUPABASE_PAGE_SIZE;
    for (;;) {
      const page = await fetchPageJson(env, viewName, offset);
      all.push(...page);
      if (page.length < SUPABASE_PAGE_SIZE) break;
      offset += SUPABASE_PAGE_SIZE;
    }
  }

  return jsonResponse(all);
}

export function missingEnvResponse() {
  console.error('Supabase 프록시 설정 누락: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 환경변수에 없음');
  return new Response(JSON.stringify({ error: '서버 설정 오류로 데이터를 불러올 수 없습니다.' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  });
}

export function proxyErrorResponse(err) {
  // err.message는 "upstream_error:<view>" 형태로만 만들어지므로 Supabase 응답 원문이나 키가
  // 여기 실릴 일은 없다. 그래도 클라이언트에는 일반화된 메시지만 내려준다.
  console.error('API 프록시 오류:', err.message);
  return new Response(JSON.stringify({ error: '데이터 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  });
}

export function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': 'private, no-cache' },
  });
}

export async function handleSalesRequest(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  try {
    return await proxyView(env, 'v_bonbu_sales');
  } catch (err) {
    return proxyErrorResponse(err);
  }
}

export async function handleUpfrontContractsRequest(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  try {
    return await proxyView(env, 'v_upfront_contracts_current');
  } catch (err) {
    return proxyErrorResponse(err);
  }
}

export async function handleLatestBatchRequest(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  try {
    const rows = await fetchPageJson(env, 'v_latest_batch_info', 0);
    return jsonResponse(rows[0] || null);
  } catch (err) {
    return proxyErrorResponse(err);
  }
}
