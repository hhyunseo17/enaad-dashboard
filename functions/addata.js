export async function onRequest(context) {
  const { env } = context;
  try {
    if (!env.DASHBOARD_BUCKET) {
      return new Response('R2 바인딩이 없습니다: DASHBOARD_BUCKET', { status: 500 });
    }

    const object = await env.DASHBOARD_BUCKET.get('addata.xlsx');
    if (object === null) {
      return new Response('파일을 찾을 수 없습니다: addata.xlsx', { status: 404 });
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
