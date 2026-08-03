export async function onRequest(context) {
  return Response.redirect(new URL('/dashboard.html', context.request.url), 302);
}
