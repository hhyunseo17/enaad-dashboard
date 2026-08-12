import { handleSalesRequest } from '../../shared/supabase-proxy.mjs';

export async function onRequest(context) {
  return handleSalesRequest(context.env);
}
