import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { TermId } from './glossary';

export type TourId = 'home' | 'draft' | 'season';

export const ONBOARDING_STORAGE_KEY = 'perfect-season-onboarding';

/**
 * localStorage that never throws. When storage is blocked (private mode,
 * quota), state lives in memory only: tours reappear next visit but stay
 * skippable.
 */
export const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // storage blocked — keep in-memory state
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // storage blocked — keep in-memory state
    }
  },
};

interface OnboardingStore {
  seen: Partial<Record<TourId, boolean>>;
  skipAll: boolean;
  /** Glossary panel UI state — session only, never persisted. */
  glossaryOpen: boolean;
  glossaryFocus: TermId | null;
  markSeen: (id: TourId) => void;
  skipAllTours: () => void;
  resetTours: () => void;
  openGlossary: (focus?: TermId) => void;
  closeGlossary: () => void;
}

/**
 * Onboarding progress. Kept apart from MetaProgress on purpose: meta syncs
 * to fixed Supabase columns, and tour flags are not worth a migration.
 */
export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      seen: {},
      skipAll: false,
      markSeen: (id) => set((s) => ({ seen: { ...s.seen, [id]: true } })),
      skipAllTours: () => set({ skipAll: true }),
      resetTours: () => set({ seen: {}, skipAll: false }),
      glossaryOpen: false,
      glossaryFocus: null,
      openGlossary: (focus) => set({ glossaryOpen: true, glossaryFocus: focus ?? null }),
      closeGlossary: () => set({ glossaryOpen: false, glossaryFocus: null }),
    }),
    {
      name: ONBOARDING_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ seen: s.seen, skipAll: s.skipAll }),
    },
  ),
);

/** True when a screen's tour should start on its own. */
export function shouldAutoStart(id: TourId): boolean {
  const { seen, skipAll } = useOnboardingStore.getState();
  return !skipAll && !seen[id];
}
