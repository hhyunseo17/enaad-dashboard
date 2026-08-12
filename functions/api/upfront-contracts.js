import { handleUpfrontContractsRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleUpfrontContractsRequest(context.env);
}
