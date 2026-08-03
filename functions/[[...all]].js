export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  let key = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (key === '') key = 'dashboard.html';

  const object = await env.DASHBOARD_BUCKET.get(key);
  if (object === null) {
    return new Response('파일을 찾을 수 없습니다: ' + key, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'private, no-cache');

  return new Response(object.body, { headers });
}
