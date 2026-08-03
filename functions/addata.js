export async function onRequest(context) {
  const { env } = context;
  const object = await env.DASHBOARD_BUCKET.get('addata.xlsx');
  if (object === null) {
    return new Response('파일을 찾을 수 없습니다: addata.xlsx', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'private, no-cache');

  return new Response(object.body, { headers });
}
