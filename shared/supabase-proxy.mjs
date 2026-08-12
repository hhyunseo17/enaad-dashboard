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

function authHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
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

// Content-Range 헤더(예: "0-26319/*")는 Prefer: count=exact 없이도 항상 내려오고, 이번 페이지가
// 실제로 몇 행을 반환했는지 알려준다. 총 행수(count=exact)를 몰라도 "이 페이지가 마지막인지"는
// 이걸로 판단 가능하다 — count=exact는 그 자체로 쿼리 비용이 붙어서(실측 +600ms) 일부러 안 쓴다.
function returnedCountFromContentRange(res) {
  const cr = res.headers.get('content-range');
  if (!cr) return null;
  const range = cr.split('/')[0];
  const parts = range.split('-');
  if (parts.length !== 2) return null;
  const start = parseInt(parts[0], 10);
  const end = parseInt(parts[1], 10);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return end - start + 1;
}

async function fetchPageJson(env, viewName, offset) {
  const res = await fetch(pageUrl(env, viewName, offset), { headers: authHeaders(env) });
  await assertOk(res, viewName);
  return res.json();
}

// 뷰 전체를 프록시 응답으로 반환한다.
//
// 첫 페이지 응답이 SUPABASE_PAGE_SIZE보다 적게 왔으면 그게 전부라는 뜻이므로, JSON으로 파싱했다가
// 다시 문자열로 만드는 과정 없이 Supabase 응답 바디를 그대로 스트리밍 전달한다 — 26,000행 규모에서
// 이 파싱+재직렬화 비용이 로딩 시간의 상당 부분을 차지했다(체감 3초 이상). 페이지가 꽉 찬 경우(더
// 있을 수 있음)에만 파싱해서 이어지는 페이지를 병렬 배치로 채운다.
export async function proxyView(env, viewName) {
  const firstRes = await fetch(pageUrl(env, viewName, 0), { headers: authHeaders(env) });
  await assertOk(firstRes, viewName);
  const returnedCount = returnedCountFromContentRange(firstRes);

  if (returnedCount !== null && returnedCount < SUPABASE_PAGE_SIZE) {
    // 흔한 경우: 이 페이지가 마지막(=전체)이라는 게 확실 — 파싱 없이 그대로 흘려보낸다.
    return new Response(firstRes.body, {
      headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': 'private, no-cache' },
    });
  }

  // 페이지가 꽉 찼거나(더 있을 수 있음) Content-Range를 못 읽은 경우 — 안전하게 파싱 후 이어서 조회.
  const firstPage = await firstRes.json();
  const all = [...firstPage];

  let offset = SUPABASE_PAGE_SIZE;
  let more = firstPage.length >= SUPABASE_PAGE_SIZE;
  while (more) {
    const batchOffsets = Array.from({ length: PAGE_CONCURRENCY }, (_, i) => offset + i * SUPABASE_PAGE_SIZE);
    const pages = await Promise.all(batchOffsets.map((o) => fetchPageJson(env, viewName, o)));
    pages.forEach((page) => all.push(...page));
    more = pages[pages.length - 1].length >= SUPABASE_PAGE_SIZE;
    offset += PAGE_CONCURRENCY * SUPABASE_PAGE_SIZE;
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
