import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client, or null when the env vars are absent — in which case the
 * whole cloud layer (accounts, sync, leaderboards) is disabled and the game
 * runs local-only, exactly as it did before Phase 5. See db/README.md.
 */
const url: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
