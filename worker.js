/**
 * KT ENA 대시보드 - R2 서빙 Worker (Zero Trust 전제)
 *
 * 인증은 이 코드가 아니라 Cloudflare Access(Zero Trust)가 앞단에서 처리합니다.
 * 이 Worker는 인증을 통과한 요청에 대해 R2 버킷의 파일을 그대로 서빙만 합니다.
 *
 * 사전 준비:
 * 1) wrangler.toml에 R2 바인딩(DASHBOARD_BUCKET) 설정
 * 2) Cloudflare 대시보드 → Zero Trust → Access → Applications에서
 *    이 Worker의 도메인/라우트를 보호 대상으로 등록 (이메일 도메인 제한, 접근 요청·승인 등 설정)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
