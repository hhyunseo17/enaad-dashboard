import { handleSalesRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  // request와 waitUntil을 넘긴다 — 엣지 캐시가 URL을 키로 쓰고, 응답을 돌려준 뒤
  // 백그라운드에서 cache.put을 끝내기 위함이다(shared/supabase-proxy.mjs 참고).
  return handleSalesRequest(context.env, context.request, context.waitUntil.bind(context));
}
