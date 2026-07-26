import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client, or null when the env vars are absent — in which case the
 * whole cloud layer (accounts, sync, leaderboards) is disabled and the game
 * runs local-only, exactly as it did before Phase 5. See db/README.md.
 */
// import.meta.env only exists under Vite; the headless smoke script runs
// this module under plain tsx, where the cloud layer just stays off.
const env: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
