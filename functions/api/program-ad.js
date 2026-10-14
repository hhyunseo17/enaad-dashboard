import { handleProgramAdRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleProgramAdRequest(context.env, context.request);
}
