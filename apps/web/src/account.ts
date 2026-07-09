import type { User } from '@supabase/supabase-js';
import { mergeMetaProgress } from '@perfect-season/sim';
import { create } from 'zustand';
import { fetchCloudMeta, upsertCloudMeta } from './cloud';
import { useGameStore } from './store';
import { supabase } from './supabase';

/**
 * Account/auth state. Guest-first: signed out, the game is untouched
 * (localStorage only). Signing in with Google merges local progress with the
 * cloud copy (max counters, union badges) so nothing earned as a guest is
 * lost, then keeps the cloud copy updated as runs finish (see cloud.ts).
 */

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AccountStore {
  /** False when Supabase env vars are absent — hides all account UI */
  enabled: boolean;
  user: User | null;
  syncStatus: SyncStatus;
  signIn: () => void;
  signOut: () => void;
}

export function displayName(user: User): string {
  const meta = user.user_metadata;
  return (
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    user.email?.split('@')[0] ||
    'Player'
  );
}

export const useAccountStore = create<AccountStore>((set) => ({
  enabled: supabase !== null,
  user: null,
  syncStatus: 'idle',

  signIn: () => {
    // Redirect flow: the page navigates away and Supabase brings us back to
    // the app URL (BASE_URL differs between dev and GitHub Pages).
    void supabase?.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href },
    });
  },

  signOut: () => {
    void supabase?.auth.signOut();
    set({ user: null, syncStatus: 'idle' });
  },
}));

/** Pull cloud meta, merge with local, write the result to both sides. */
async function mergeOnSignIn(userId: string): Promise<void> {
  useAccountStore.setState({ syncStatus: 'syncing' });
  try {
    const cloud = await fetchCloudMeta(userId);
    const local = useGameStore.getState().meta;
    const merged = cloud ? mergeMetaProgress(local, cloud) : local;
    useGameStore.setState({ meta: merged });
    await upsertCloudMeta(userId, merged);
    useAccountStore.setState({ syncStatus: 'synced' });
  } catch (err) {
    console.warn('Progress sync failed (local progress is unaffected):', err);
    useAccountStore.setState({ syncStatus: 'error' });
  }
}

if (supabase) {
  let syncedUserId: string | null = null;
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    useAccountStore.setState({ user });
    if (user && user.id !== syncedUserId) {
      syncedUserId = user.id;
      // Deferred: Supabase warns against awaiting its own calls inside this
      // callback (it holds an internal lock).
      setTimeout(() => void mergeOnSignIn(user.id), 0);
    }
    if (!user) syncedUserId = null;
  });
}
