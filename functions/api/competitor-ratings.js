import { handleCompetitorRatingsRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleCompetitorRatingsRequest(context.env, context.request);
}
