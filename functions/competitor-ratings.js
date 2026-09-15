import { requireMetricsAccess } from '../shared/supabase-proxy.mjs';

// 지표 대시보드는 롤아웃 초기라 이메일 허용목록으로 제한한다(requireMetricsAccess 참고,
// 다른 addata.js/functions/api/*.js는 로그인만 하면 전원 접근 가능 — 이 두 파일만 예외).
export async function onRequest(context) {
  const { env, request } = context;
  const authError = await requireMetricsAccess(env, request);
  if (authError) return authError;
  try {
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
