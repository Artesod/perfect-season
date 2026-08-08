import type { Player, PlayerPool, Position, RunState, SeasonEvent } from '@perfect-season/shared';
import {
  createRun,
  playNextGame,
  recordRun,
  resolvePendingCard,
  runPickPlayer,
  runRerollTeam,
  runResolveNagging,
  runSignPlayer,
  runWaivePlayer,
  startSeason,
  emptyMetaProgress,
  type MetaProgress,
} from '@perfect-season/sim';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EVENT_CARDS } from './cards';
import { syncFinishedRun } from './cloud';

interface GameStore {
  run: RunState | null;
  /** Real-player pool the current run was created with; null = procedural run */
  runPool: PlayerPool | null;
  meta: MetaProgress;
  /** Badges earned by the most recently finished run */
  newBadges: string[];
  /** Events that fired during the last play action (single game or sim burst) */
  lastGameEvents: SeasonEvent[];

  newRun: (seed: number, ascension: number, pool: PlayerPool | null, casual?: boolean) => void;
  exitRun: () => void;
  /** Draft a player; asPosition picks which role a dual-position player fills */
  pickPlayer: (playerId: string, asPosition?: Position) => void;
  rerollTeam: () => void;
  beginSeason: () => void;
  playGame: () => void;
  simToNextEvent: () => void;
  resolveCard: (choiceId: string) => void;
  /** Resolve a pending nagging injury: play him hurt or sit him */
  resolveNagging: (choice: 'play' | 'sit') => void;
  signFreeAgent: (player: Player) => void;
  waivePlayer: (playerId: string) => void;
}

/**
 * Version tag stored with cloud runs so seeds can be re-verified against the
 * exact datasets later. Current-only runs keep the bare date (the pre-era
 * format); era modes prefix the mode.
 */
function poolVersion(pool: PlayerPool | null): string | null {
  if (!pool) return null;
  if (pool.mode === 'current') return pool.nba?.fetchedAt ?? null;
  const dates = [pool.nba?.fetchedAt, pool.eras?.fetchedAt].filter(Boolean).join('+');
  return `${pool.mode}@${dates}`;
}

/**
 * Fold a terminal run into meta and report which badges are new. Also pushes
 * the run + updated meta to the cloud, fire-and-forget: a no-op when signed
 * out, and failures never affect local state.
 */
function finishRun(
  run: RunState,
  meta: MetaProgress,
  pool: PlayerPool | null,
): { meta: MetaProgress; newBadges: string[] } {
  const next = recordRun(meta, run);
  const before = new Set(meta.badges);
  // Casual (no-cap) runs are leaderboard-ineligible: never posted.
  if (!run.casual) void syncFinishedRun(run, next, poolVersion(pool));
  return { meta: next, newBadges: next.badges.filter((id) => !before.has(id)) };
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      run: null,
      runPool: null,
      meta: emptyMetaProgress(),
      newBadges: [],
      lastGameEvents: [],

      newRun: (seed, ascension, pool, casual = false) =>
        set({
          run: createRun(seed, ascension, pool ?? undefined, casual),
          runPool: pool,
          newBadges: [],
          lastGameEvents: [],
        }),

      exitRun: () => set({ run: null, runPool: null, lastGameEvents: [] }),

      pickPlayer: (playerId, asPosition) =>
        set({ run: runPickPlayer(get().run!, playerId, asPosition) }),

      rerollTeam: () => set({ run: runRerollTeam(get().run!) }),

      beginSeason: () => set({ run: startSeason(get().run!) }),

      playGame: () => {
        const { run, meta, runPool } = get();
        const eventsBefore = run!.season!.events.length;
        const next = playNextGame(run!, EVENT_CARDS);
        const finished =
          next.status === 'won' || next.status === 'lost'
            ? finishRun(next, meta, runPool)
            : null;
        set({
          run: next,
          lastGameEvents: next.season!.events.slice(eventsBefore),
          ...(finished ?? {}),
        });
      },

      simToNextEvent: () => {
        const { run, meta, runPool } = get();
        const eventsBefore = run!.season!.events.length;
        let next = run!;
        while (
          next.status === 'in-season' &&
          !next.season!.pendingCard &&
          !next.season!.pendingNagging
        ) {
          next = playNextGame(next, EVENT_CARDS);
        }
        const finished =
          next.status === 'won' || next.status === 'lost'
            ? finishRun(next, meta, runPool)
            : null;
        set({
          run: next,
          lastGameEvents: next.season!.events.slice(eventsBefore),
          ...(finished ?? {}),
        });
      },

      resolveCard: (choiceId) =>
        set({ run: resolvePendingCard(get().run!, EVENT_CARDS, choiceId) }),

      resolveNagging: (choice) => set({ run: runResolveNagging(get().run!, choice) }),

      signFreeAgent: (player) => set({ run: runSignPlayer(get().run!, player) }),

      waivePlayer: (playerId) => set({ run: runWaivePlayer(get().run!, playerId) }),
    }),
    {
      name: 'perfect-season-meta',
      partialize: (state) => ({ meta: state.meta }),
    },
  ),
);
