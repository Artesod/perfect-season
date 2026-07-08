import type { NbaDataset, Player, RunState, SeasonEvent } from '@perfect-season/shared';
import {
  createRun,
  playNextGame,
  recordRun,
  resolvePendingCard,
  runDraftPlayer,
  runSignPlayer,
  runUndraftPlayer,
  runWaivePlayer,
  startSeason,
  emptyMetaProgress,
  type MetaProgress,
} from '@perfect-season/sim';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EVENT_CARDS } from './cards';

interface GameStore {
  run: RunState | null;
  /** Real-NBA dataset the current run was created with; null = procedural run */
  runDataset: NbaDataset | null;
  meta: MetaProgress;
  /** Badges earned by the most recently finished run */
  newBadges: string[];
  /** Events that fired during the last play action (single game or sim burst) */
  lastGameEvents: SeasonEvent[];

  newRun: (seed: number, ascension: number, dataset: NbaDataset | null) => void;
  exitRun: () => void;
  draftPlayer: (playerId: string) => void;
  undraftPlayer: (playerId: string) => void;
  beginSeason: () => void;
  playGame: () => void;
  simToNextEvent: () => void;
  resolveCard: (choiceId: string) => void;
  signFreeAgent: (player: Player) => void;
  waivePlayer: (playerId: string) => void;
}

/** Fold a terminal run into meta and report which badges are new. */
function finishRun(
  run: RunState,
  meta: MetaProgress,
): { meta: MetaProgress; newBadges: string[] } {
  const next = recordRun(meta, run);
  const before = new Set(meta.badges);
  return { meta: next, newBadges: next.badges.filter((id) => !before.has(id)) };
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      run: null,
      runDataset: null,
      meta: emptyMetaProgress(),
      newBadges: [],
      lastGameEvents: [],

      newRun: (seed, ascension, dataset) =>
        set({
          run: createRun(seed, ascension, dataset ?? undefined),
          runDataset: dataset,
          newBadges: [],
          lastGameEvents: [],
        }),

      exitRun: () => set({ run: null, runDataset: null, lastGameEvents: [] }),

      draftPlayer: (playerId) => set({ run: runDraftPlayer(get().run!, playerId) }),

      undraftPlayer: (playerId) => set({ run: runUndraftPlayer(get().run!, playerId) }),

      beginSeason: () => set({ run: startSeason(get().run!) }),

      playGame: () => {
        const { run, meta } = get();
        const eventsBefore = run!.season!.events.length;
        const next = playNextGame(run!, EVENT_CARDS);
        const finished =
          next.status === 'won' || next.status === 'lost' ? finishRun(next, meta) : null;
        set({
          run: next,
          lastGameEvents: next.season!.events.slice(eventsBefore),
          ...(finished ?? {}),
        });
      },

      simToNextEvent: () => {
        const { run, meta } = get();
        const eventsBefore = run!.season!.events.length;
        let next = run!;
        while (next.status === 'in-season' && !next.season!.pendingCard) {
          next = playNextGame(next, EVENT_CARDS);
        }
        const finished =
          next.status === 'won' || next.status === 'lost' ? finishRun(next, meta) : null;
        set({
          run: next,
          lastGameEvents: next.season!.events.slice(eventsBefore),
          ...(finished ?? {}),
        });
      },

      resolveCard: (choiceId) =>
        set({ run: resolvePendingCard(get().run!, EVENT_CARDS, choiceId) }),

      signFreeAgent: (player) => set({ run: runSignPlayer(get().run!, player) }),

      waivePlayer: (playerId) => set({ run: runWaivePlayer(get().run!, playerId) }),
    }),
    {
      name: 'perfect-season-meta',
      partialize: (state) => ({ meta: state.meta }),
    },
  ),
);
