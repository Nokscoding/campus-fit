import { createClient } from "@supabase/supabase-js";

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function callRpc(name, args = {}) {
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) {
    console.error("Campus Fit RPC error", name, error.message);
    return { error: "server_error" };
  }
  return data;
}
