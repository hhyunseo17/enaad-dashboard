import { requireMetricsAccess } from '../shared/supabase-proxy.mjs';

// 지표 대시보드는 롤아웃 초기라 이메일 허용목록으로 제한한다(requireMetricsAccess 참고,
// 다른 addata.js/functions/api/*.js는 로그인만 하면 전원 접근 가능 — 이 두 파일만 예외).
export async function onRequest(context) {
  const { env, request } = context;
  // requireMetricsAccess()도 이 try 안에 넣는다 — 밖에 있으면 그 안의 예외(JWKS fetch 실패 등)가
  // 메시지 없는 플랫폼 500으로 죽어서 원인을 알 수 없다(2026-09-15 실제 발생, err.message 없는
  // 빈 500만 보임 — 원인 특정 못 함). 여기 안에 넣으면 최소한 err.message는 응답에 남는다.
  try {
    const authError = await requireMetricsAccess(env, request);
    if (authError) return authError;

    if (!env.DASHBOARD_BUCKET) {
      return new Response('R2 바인딩이 없습니다: DASHBOARD_BUCKET', { status: 500 });
    }

    const object = await env.DASHBOARD_BUCKET.get('competitor-ratings.xlsx');
    if (object === null) {
      return new Response('파일을 찾을 수 없습니다: competitor-ratings.xlsx', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, no-cache');

    return new Response(object.body, { headers });
  } catch (err) {
    return new Response(`서버 오류: ${err.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
    });
  }
}
