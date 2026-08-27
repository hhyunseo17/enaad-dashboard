// ============================================================
// shared/supabase-proxy.mjs
// Supabase REST(PostgREST) 프록시 공용 로직. worker.js(standalone Worker 배포용)와
// functions/api/*.js(Cloudflare Pages Functions 배포용, 이 프로젝트가 실제로 쓰는 경로)가
// 함께 쓴다 — 로직을 두 벌로 유지하지 않기 위해 여기 하나만 둔다.
//
// env에는 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 있어야 한다(Worker secret 또는
// Pages 환경변수). Supabase 조회 자체는 service_role key로만 하고(anon key는 이 프록시에서
// 쓰지 않는다 — 브라우저 쪽 로그인 SDK 전용), 브라우저 요청은 Supabase Auth 로그인 세션의
// JWT(Authorization: Bearer)를 verifySupabaseJwt()로 검증한 뒤에만 통과시킨다(아래
// "인증 게이트" 절 참고). JWT 검증은 SUPABASE_URL의 공개 JWKS 엔드포인트만 쓰므로 별도
// 시크릿이 필요 없다.
// ============================================================

// PostgREST 기본 max-rows(1000)보다 크게 요청하려면 Supabase 프로젝트 설정(Settings → API → Max Rows)도
// 이 값 이상으로 올려야 한다 — 설정만 올리고 클라이언트 요청 limit을 그대로 두면 여전히 1000행씩 잘린다.
// 현재 데이터가 26,000행대이므로 30,000으로 잡으면 보통 1페이지로 끝난다.
const SUPABASE_PAGE_SIZE = 30000;
const PAGE_CONCURRENCY = 4; // 데이터가 더 늘어나 여러 페이지가 필요해지는 경우를 대비한 안전판(순차 대기 방지)

// ------------------------------------------------------------
// v_bonbu_sales 응답 컬럼 별칭 — /api/sales 페이로드 축소용.
//
// 이 뷰는 26,000행대라 응답 시간의 상당 부분이 페이로드 바이트 수에 딸려 온다(뷰 계산 자체는
// 0.2~0.3초). 그런데 `select=*` 응답 21.98MB 중 **14.64MB(67%)가 행마다 반복되는 컬럼 이름**이었다.
// 값은 7.34MB뿐이다. 그래서 PostgREST 별칭(`select=별칭:컬럼`)으로 키 이름을 2자로 줄인다.
//
// 실측(8쌍 교차, 순서 편향 제거): 23.15MB → 12.08MB, 총 소요 2,121ms → 1,629ms(평균 기준 23%,
// 최소 기준 27%, 중앙 기준 19%). 페이로드는 절반이 됐지만 시간은 그만큼 줄지 않는다 — 왕복 지연과
// 뷰 계산이라는 고정 비용이 남기 때문이다. 회차 편차가 ±30%에 달하므로(Supabase 공유 인스턴스)
// 이 값을 다시 잴 때는 반드시 교차 반복 측정할 것. 단발 측정은 38%로도, 14%로도 나온다.
// 값 동일성은 879,714개 필드 전수 대조로 select=* 와 완전히 일치함을 확인했다.
//
// 여기서 빠진 컬럼(load_batch_id / is_bonbu / is_excluded / excluded_reason / raw_id)은
// 프론트가 읽지 않는다. 앞의 셋은 v_bonbu_sales 정의상 항상 상수(true/false/null)라
// 행마다 실어 보낼 이유가 없다. bonbu_revenue_status(bs)도 이 뷰에서는 항상 '본부매출'이지만
// **일부러 남긴다** — 모든 집계가 이 값으로 본부매출을 판정하기 때문에(CLAUDE.md 절대원칙 1)
// 클라이언트가 지어내는 상수로 바꾸면 그 가드가 형해화된다. 0.94MB는 그 대가로 지불한다.
//
// ⚠ 이 표를 고치면 js/core/data-loader.js의 mapRowFromSupabase()도 반드시 같이 고칠 것.
//    빌드 도구가 없어 두 파일이 상수를 공유할 수 없다. 어긋나면 조용히 undefined가 되므로
//    data-loader 쪽에 키 존재 여부 검증(assertSalesRowShape)을 두었다.
// ------------------------------------------------------------
const SALES_COLUMN_ALIASES = {
  id: 'id', ms: 'month_str', yr: 'year', mo: 'month',
  dp: 'dept', mg: 'manager', ad: 'advertiser', ag: 'agency', gg: 'agency_group',
  ch: 'channel', iu: 'industry', i2: 'industry_mid', i3: 'industry_sub', bd: 'broad_digital',
  co: 'category_original', sc: 'sub_category', s3: 'sub_category3',
  nn: 'one_n_flag', cr: 'category_reclassified', rb: 'revenue_basis', bs: 'bonbu_revenue_status',
  rm: 'remark', aw: 'amount_won', uf: 'is_upfront',
  cy: 'contract_start_y', cm: 'contract_start_m', ey: 'contract_end_y', em: 'contract_end_m',
  cs: 'contract_start_date', ce: 'contract_end_date',
  ck: 'upfront_contract_amount_eok', cw: 'contract_amount_won', gn: 'gross_net_flag',
  ua: 'upfront_advertiser_raw', un: 'upfront_note',
};

const SALES_SELECT = Object.entries(SALES_COLUMN_ALIASES)
  .map(([alias, column]) => (alias === column ? column : `${alias}:${column}`))
  .join(',');

function authHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function pageUrl(env, viewName, offset, select) {
  return `${env.SUPABASE_URL}/rest/v1/${viewName}?select=${encodeURIComponent(select)}&limit=${SUPABASE_PAGE_SIZE}&offset=${offset}`;
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

async function fetchPageJson(env, viewName, offset, select = '*') {
  const res = await fetch(pageUrl(env, viewName, offset, select), { headers: authHeaders(env) });
  await assertOk(res, viewName);
  return res.json();
}

// 뷰 전체를 프록시 응답으로 반환한다.
//
// 첫 페이지 응답이 SUPABASE_PAGE_SIZE보다 적게 왔으면 그게 전부라는 뜻이므로, JSON으로 파싱했다가
// 다시 문자열로 만드는 과정 없이 Supabase 응답 바디를 그대로 스트리밍 전달한다 — 26,000행 규모에서
// 이 파싱+재직렬화 비용이 로딩 시간의 상당 부분을 차지했다(체감 3초 이상). 페이지가 꽉 찬 경우(더
// 있을 수 있음)에만 파싱해서 이어지는 페이지를 병렬 배치로 채운다.
export async function proxyView(env, viewName, select = '*') {
  const firstRes = await fetch(pageUrl(env, viewName, 0, select), { headers: authHeaders(env) });
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
    const pages = await Promise.all(batchOffsets.map((o) => fetchPageJson(env, viewName, o, select)));
    pages.forEach((page) => all.push(...page));
    more = pages[pages.length - 1].length >= SUPABASE_PAGE_SIZE;
    offset += PAGE_CONCURRENCY * SUPABASE_PAGE_SIZE;
  }

  return jsonResponse(all);
}

// ------------------------------------------------------------
// 인증 게이트 — Cloudflare Access(Zero Trust) 대신 Supabase Auth 로그인 세션(JWT)을 검증한다.
//
// 이 프로젝트는 Supabase 대시보드 JWT Keys에서 이미 레거시 HS256 공유 비밀키 → 비대칭
// ES256(ECC P-256) 서명키로 전환돼 있다(확인: Settings → JWT Keys, 이전 HS256 키는 "Previous
// key"로만 남아 곧 만료될 옛 세션 검증용). 그래서 여기서는 공유 비밀키(SUPABASE_JWT_SECRET)를
// env에 두지 않고, **공개** JWKS 엔드포인트(`{SUPABASE_URL}/auth/v1/.well-known/jwks.json` —
// 비밀값이 아니라 공개 검증키라 노출돼도 무해하다)에서 공개키를 받아 Web Crypto(ECDSA
// verify)로 서명을 로컬 검증한다. Supabase에 매 요청 왕복하지 않는 것은 동일하다 — JWKS
// 자체를 모듈 스코프에 캐시해두기 때문(엣지 캐시가 주는 속도 이점을 인증 때문에 까먹지
// 않기 위해서다. 아래 withEdgeCache 주석 참고).
// ------------------------------------------------------------
function base64UrlToBytes(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Worker 모듈 스코프 — 요청 사이에 유지되는 인메모리 캐시(isolate가 재활용되는 동안만).
// 키 로테이션은 드물게 일어나므로 1시간 TTL을 두고, kid가 안 맞으면(로테이션 직후 등)
// 캐시를 무시하고 한 번 더 조회한다.
let jwksCache = { keys: [], fetchedAt: 0 };
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(env) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
  if (!res.ok) return null;
  const { keys } = await res.json();
  return keys;
}

async function findJwk(env, kid) {
  const fresh = Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS;
  if (fresh) {
    const hit = jwksCache.keys.find((k) => k.kid === kid);
    if (hit) return hit;
  }
  const keys = await fetchJwks(env);
  if (!keys) return jwksCache.keys.find((k) => k.kid === kid) || null; // 조회 실패 시 옛 캐시라도 시도
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys.find((k) => k.kid === kid) || null;
}

async function verifySupabaseJwt(env, request) {
  const header = request && request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let jwtHeader, payload;
  try {
    jwtHeader = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));
  } catch {
    return null;
  }
  if (jwtHeader.alg !== 'ES256') return null; // 이 프로젝트가 발급하는 현재 서명 알고리즘(위 주석 참고).
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (payload.role !== 'authenticated' && payload.aud !== 'authenticated') return null;

  const jwk = await findJwk(env, jwtHeader.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  return { sub: payload.sub, email: payload.email };
}

function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  });
}

// 각 handle*Request 맨 앞에서 호출한다 — null이면 통과, Response면 그대로 반환하고 중단.
async function requireAuth(env, request) {
  const user = await verifySupabaseJwt(env, request);
  if (!user) return unauthorizedResponse();
  return null;
}

// ------------------------------------------------------------
// 엣지 캐시 — /api/sales의 왕복을 없애기 위한 것.
//
// 페이로드를 별칭으로 절반(23MB→12MB)까지 깎아도 1.6초가 남았다. 남은 비용은 바이트가 아니라
// 왕복 지연과 뷰 계산이라는 고정비라서, 더 깎는 게 아니라 아예 다시 묻지 않는 쪽이 답이다.
// 데이터는 ETL 컷오버 때만 바뀌므로 배치 단위로는 불변이다.
//
// **무효화 로직을 두지 않는다.** 프론트가 `?batch=<id>`를 붙여 요청하고, 컷오버로 ID가 바뀌면
// URL이 달라져 새 키가 자연히 미스 난다. 옛 객체는 LRU로 밀려난다. 대안으로 검토했던 두 가지는
// 버렸다 — (a) ETL이 purge를 호출하는 방식은 수동 실행이라 한 번 빼먹으면 낡은 숫자를 조용히
// 계속 보여준다. (b) 서버가 매 요청마다 배치 ID를 조회해 키를 만드는 방식은 캐시가 맞아도
// Supabase 왕복이 하나 남아 목표치(0.2초대)를 그 자체로 다 먹는다.
//
// 되돌리는 방법이 세 겹이다. 안쪽부터:
//   1) 프론트가 `?batch=`를 안 붙이면 아래 handleSalesRequest가 캐시 경로를 건너뛴다
//      (js/core/state.js의 USE_EDGE_CACHE = false — 배포 한 줄).
//   2) Pages 환경변수 EDGE_CACHE_DISABLED=1 — 재배포 없이 즉시.
//   3) 이 커밋 revert.
//
// 인증은 캐시보다 앞에 있다: 각 handle*Request가 withEdgeCache를 부르기 전에 requireAuth()로
// Supabase Auth JWT를 검증하므로(위 "인증 게이트" 절), 인증된 요청만 여기 도달한다.
// caches.default는 이 함수 안에서만 접근하는 서버 측 캐시다. 다만 브라우저로 내려보내는
// 헤더는 public이 아니라 private으로 바꿔 공용 프록시에 남지 않게 한다
// (캐시에 넣을 때는 public이어야 한다 — Cache API가 private 응답을 저장하지 않는다).
// ------------------------------------------------------------
const SALES_CACHE_MAX_AGE = 31536000; // 1년. URL에 배치 ID가 있어 사실상 불변이다.
const LATEST_BATCH_CACHE_MAX_AGE = 60; // 배치 변경 감지가 최대 이만큼 늦어진다. ETL이 수동이라 무해하다.

function edgeCacheDisabled(env) {
  return String((env && env.EDGE_CACHE_DISABLED) || '') === '1';
}

// 인증 쿠키·헤더가 키에 섞이지 않도록 URL만으로 합성 GET 요청을 만든다.
function edgeCacheKey(request) {
  return new Request(new URL(request.url).toString(), { method: 'GET' });
}

function browserResponse(res, maxAge, state) {
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Cache-Control': `private, max-age=${maxAge}`,
      'X-Edge-Cache': state, // 실측·디버깅용. HIT/MISS/OFF.
    },
  });
}

async function withEdgeCache(env, request, waitUntil, maxAge, produce) {
  if (!request || edgeCacheDisabled(env) || typeof caches === 'undefined') {
    return browserResponse(await produce(), 0, 'OFF');
  }
  const cache = caches.default;
  const key = edgeCacheKey(request);
  const hit = await cache.match(key);
  if (hit) return browserResponse(hit, maxAge, 'HIT');

  const fresh = await produce();
  if (!fresh.ok) return fresh; // 실패 응답은 캐시하지 않는다.
  const forCache = new Response(fresh.clone().body, {
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': `public, max-age=${maxAge}` },
  });
  const put = cache.put(key, forCache);
  if (waitUntil) waitUntil(put); else await put;
  return browserResponse(fresh, maxAge, 'MISS');
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

export async function handleSalesRequest(env, request, waitUntil) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  const authError = await requireAuth(env, request);
  if (authError) return authError;
  try {
    // 별칭 select — 응답 키는 SALES_COLUMN_ALIASES의 짧은 이름이다(위 주석 참고).
    const produce = () => proxyView(env, 'v_bonbu_sales', SALES_SELECT);
    // ?batch=가 없으면 캐시를 타지 않고 예전과 똑같이 동작한다 — 프론트 쪽 폴백 경로.
    const hasBatch = request ? new URL(request.url).searchParams.has('batch') : false;
    if (!hasBatch) return await produce();
    return await withEdgeCache(env, request, waitUntil, SALES_CACHE_MAX_AGE, produce);
  } catch (err) {
    return proxyErrorResponse(err);
  }
}

export async function handleUpfrontContractsRequest(env, request) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  const authError = await requireAuth(env, request);
  if (authError) return authError;
  try {
    return await proxyView(env, 'v_upfront_contracts_current');
  } catch (err) {
    return proxyErrorResponse(err);
  }
}

export async function handleTargetsRequest(env, request) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  const authError = await requireAuth(env, request);
  if (authError) return authError;
  try {
    return await proxyView(env, 'sales_targets');
  } catch (err) {
    return proxyErrorResponse(err);
  }
}

export async function handleLatestBatchRequest(env, request, waitUntil) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return missingEnvResponse();
  const authError = await requireAuth(env, request);
  if (authError) return authError;
  try {
    // 이 조회가 /api/sales보다 앞에 서게 되었으므로(프론트가 배치 ID를 알아야 URL을 만든다)
    // 여기에도 짧은 TTL을 건다. 이게 없으면 캐시 히트에도 Supabase 왕복이 하나 남는다.
    const produce = async () => jsonResponse((await fetchPageJson(env, 'v_latest_batch_info', 0))[0] || null);
    return await withEdgeCache(env, request, waitUntil, LATEST_BATCH_CACHE_MAX_AGE, produce);
  } catch (err) {
    return proxyErrorResponse(err);
  }
}
