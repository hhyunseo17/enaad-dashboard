import { handleLatestBatchRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleLatestBatchRequest(context.env);
}
