import { handleTargetsRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleTargetsRequest(context.env);
}
