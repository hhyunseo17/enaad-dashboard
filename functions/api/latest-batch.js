import { handleLatestBatchRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleLatestBatchRequest(context.env, context.request, context.waitUntil.bind(context));
}
