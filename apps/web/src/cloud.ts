import type { RunState } from '@perfect-season/shared';
import type { MetaProgress } from '@perfect-season/sim';
import { supabase } from './supabase';

/**
 * Data layer over the Supabase tables in db/schema.sql. Every function
 * no-ops (or returns empty) when Supabase isn't configured or nobody is
 * signed in, so callers never need to guard.
 */

export interface LeaderboardEntry {
  id: string;
  userId: string;
  displayName: string;
  seed: number;
  ascension: number;
  wins: number;
  losses: number;
  won: boolean;
  datasetVersion: string | null;
  createdAt: string;
}

interface MetaRow {
  total_runs: number;
  runs_won: number;
  best_wins: number;
  highest_ascension_beaten: number;
  badges: string[];
}

function toMetaRow(userId: string, meta: MetaProgress): MetaRow & { user_id: string } {
  return {
    user_id: userId,
    total_runs: meta.totalRuns,
    runs_won: meta.runsWon,
    best_wins: meta.bestWins,
    highest_ascension_beaten: meta.highestAscensionBeaten,
    badges: meta.badges,
  };
}

export async function fetchCloudMeta(userId: string): Promise<MetaProgress | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('meta_progress')
    .select('total_runs, runs_won, best_wins, highest_ascension_beaten, badges')
    .eq('user_id', userId)
    .maybeSingle<MetaRow>();
  if (error) throw new Error(`fetch meta_progress: ${error.message}`);
  if (!data) return null;
  return {
    totalRuns: data.total_runs,
    runsWon: data.runs_won,
    bestWins: data.best_wins,
    highestAscensionBeaten: data.highest_ascension_beaten,
    badges: data.badges,
  };
}

export async function upsertCloudMeta(userId: string, meta: MetaProgress): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('meta_progress')
    .upsert({ ...toMetaRow(userId, meta), updated_at: new Date().toISOString() });
  if (error) throw new Error(`upsert meta_progress: ${error.message}`);
}

/**
 * Record a finished run and the updated meta in the cloud. Fire-and-forget
 * from the game store: failures only warn — cloud sync must never interfere
 * with local play.
 */
export async function syncFinishedRun(
  run: RunState,
  meta: MetaProgress,
  datasetVersion: string | null,
): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  try {
    const { error } = await supabase.from('runs').insert({
      user_id: userId,
      seed: run.seed,
      ascension: run.ascension,
      wins: run.wins,
      losses: run.losses,
      won: run.status === 'won',
      dataset_version: datasetVersion,
    });
    if (error) throw new Error(`insert run: ${error.message}`);
    await upsertCloudMeta(userId, meta);
  } catch (err) {
    console.warn('Cloud sync of finished run failed (progress is saved locally):', err);
  }
}

/** Top runs: most wins first, hardest ascension breaking ties. */
export async function fetchLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('wins', { ascending: false })
    .order('ascension', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`fetch leaderboard: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    seed: Number(row.seed),
    ascension: row.ascension,
    wins: row.wins,
    losses: row.losses,
    won: row.won,
    datasetVersion: row.dataset_version,
    createdAt: row.created_at,
  }));
}
