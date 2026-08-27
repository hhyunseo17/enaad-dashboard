/**
 * KT ENA 대시보드 - R2 서빙 + Supabase 프록시 Worker (Zero Trust 전제)
 *
 * ⚠️ 이 프로젝트는 현재 Cloudflare **Pages**(Git 연동 자동배포, `functions/` 디렉터리)로 배포된다.
 * Pages는 이 파일(worker.js)을 실행하지 않는다 — 실제 서빙 중인 /api/* 프록시는
 * `functions/api/sales.js` 등이다. 이 파일은 향후 standalone Cloudflare Worker로 배포를
 * 전환할 경우를 대비해 유지하며, 로직은 `shared/supabase-proxy.mjs`를 공유해 두 벌로
 * 관리하지 않는다.
 *
 * 개인별 인증은 Supabase Auth(로그인 화면)가 맡고, /api/* 각 핸들러가 요청의
 * Authorization: Bearer <JWT>를 shared/supabase-proxy.mjs의 requireAuth()로 검증한다
 * (Cloudflare Access 무료 플랜의 인증 사용자 50명 제한 때문에 개인별 게이트를 옮겼다).
 * Zero Trust(Access)는 IP 허용목록 등 네트워크 레벨 방어로만 남기는 것이 목표이며, 이 전환은
 * Cloudflare 대시보드 작업이라 이 레포와 별개로 진행한다(진행 전까지는 Access 이메일 정책이
 * 이 Worker 앞단에도 그대로 남아있을 수 있다).
 * 이 Worker는:
 *   - "/api/*"가 아니면: R2 버킷의 정적 파일을 그대로 서빙
 *   - "/api/*"면: JWT 검증 통과 후 Supabase를 서버 측에서 대신 조회해 결과만 반환 (Supabase 프록시)
 *
 * 왜 프록시가 필요한가: Supabase(*.supabase.co)는 대시보드와 다른 도메인이다. 브라우저가
 * anon key로 Supabase를 직접 호출하는 경로는 쓰지 않는다 — 대신 이 Worker가
 * SUPABASE_SERVICE_ROLE_KEY(브라우저에는 절대 노출되지 않음)로 서버 측에서 Supabase를
 * 조회하고, 요청 자체는 Supabase Auth JWT로 게이트한다.
 *
 * 사전 준비:
 * 1) wrangler.toml에 R2 바인딩(DASHBOARD_BUCKET) 설정
 * 2) (선택, 나중에) Cloudflare 대시보드 → Zero Trust → Access → Applications에서
 *    IP 허용목록 정책으로 교체
 * 3) `wrangler secret put SUPABASE_URL`, `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
 *    (wrangler.toml에 평문으로 넣지 말 것 — git에 커밋되는 파일이다. JWT 검증은 공개 JWKS
 *    엔드포인트만 쓰므로 별도 시크릿이 필요 없다 — shared/supabase-proxy.mjs 참고)
 */

import { handleSalesRequest, handleUpfrontContractsRequest, handleTargetsRequest, handleLatestBatchRequest } from './shared/supabase-proxy.mjs';

// request/waitUntil은 엣지 캐시용이다(shared/supabase-proxy.mjs). 캐시를 쓰지 않는 두
// 엔드포인트는 예전처럼 env만 받는다.
async function handleApiRequest(env, pathname, request, waitUntil) {
  if (pathname === '/api/sales') return handleSalesRequest(env, request, waitUntil);
  if (pathname === '/api/upfront-contracts') return handleUpfrontContractsRequest(env, request);
  if (pathname === '/api/targets') return handleTargetsRequest(env, request);
  if (pathname === '/api/latest-batch') return handleLatestBatchRequest(env, request, waitUntil);
  return new Response('Not found', { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(env, url.pathname, request, ctx ? ctx.waitUntil.bind(ctx) : null);
    }

    let key = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (key === '') key = 'dashboard.html'; // 루트 접속 시 대시보드 기본 파일

    const object = await env.DASHBOARD_BUCKET.get(key);
    if (object === null) {
      return new Response('파일을 찾을 수 없습니다: ' + key, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers); // Content-Type 등 R2에 저장된 메타데이터 그대로 사용
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, no-cache');

    return new Response(object.body, { headers });
  },
};
