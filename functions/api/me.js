import { handleMeRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleMeRequest(context.env, context.request);
}
