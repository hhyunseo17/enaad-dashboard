import { handleCompetitorRatingsMetaRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleCompetitorRatingsMetaRequest(context.env, context.request);
}
