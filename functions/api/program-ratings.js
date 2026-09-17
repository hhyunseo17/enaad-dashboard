import { handleProgramRatingsRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleProgramRatingsRequest(context.env, context.request);
}
