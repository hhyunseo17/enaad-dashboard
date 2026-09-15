import { handleCompetitorRevenueRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleCompetitorRevenueRequest(context.env, context.request);
}
