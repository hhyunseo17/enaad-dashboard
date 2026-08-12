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

const SUPABASE_PAGE_SIZE = 1000; // PostgREST 기본 max-rows 대응

export async function fetchAllFromView(env, viewName) {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = `${env.SUPABASE_URL}/rest/v1/${viewName}?select=*&limit=${SUPABASE_PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      // Supabase 원본 응답 본문은 브라우저로 그대로 돌려보내지 않는다(내부 쿼리/스키마 정보 노출 방지).
      // 상세는 서버 로그(wrangler tail 또는 Pages Functions 로그)로만 남긴다.
      console.error(`Supabase 조회 실패(${viewName}): HTTP ${res.status} ${text}`);
      throw new Error(`upstream_error:${viewName}`);
    }
    const page = await res.json();
    all.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    offset += SUPABASE_PAGE_SIZE;
  }
  return all;
}

export function missingEnvResponse() {
  console.error('Supabase 프록시 설정 누락: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 환경변수에 없음');
  return new Response(JSON.stringify({ error: '서버 설정 오류로 데이터를 불러올 수 없습니다.' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  });
}

export function proxyErrorResponse(err) {
  // err.message는 fetchAllFromView가 "upstream_error:<view>" 형태로만 만들므로 Supabase 응답
  // 원문이나 키가 여기 실릴 일은 없다. 그래도 클라이언트에는 일반화된 메시지만 내려준다.
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

// env가 준비돼 있으면 payload를, 아니면 에러 Response를 던지는 형태로 3개 라우트가 공유하는 실제 처리.
export async function handleSalesRequest(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  try {
    return jsonResponse(await fetchAllFromView(env, 'v_bonbu_sales'));
  } catch (err) {
    return proxyErrorResponse(err);
  }
}

export async function handleUpfrontContractsRequest(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  try {
    return jsonResponse(await fetchAllFromView(env, 'v_upfront_contracts_current'));
  } catch (err) {
    return proxyErrorResponse(err);
  }
}

export async function handleLatestBatchRequest(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  try {
    const rows = await fetchAllFromView(env, 'v_latest_batch_info');
    return jsonResponse(rows[0] || null);
  } catch (err) {
    return proxyErrorResponse(err);
  }
}
