import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEY, shouldAutoStart, useOnboardingStore } from './onboardingStore';

beforeEach(() => {
  useOnboardingStore.setState({ seen: {}, skipAll: false });
});

describe('onboarding store', () => {
  it('auto-starts tours that were never seen', () => {
    expect(shouldAutoStart('home')).toBe(true);
    expect(shouldAutoStart('draft')).toBe(true);
  });

  it('markSeen stops auto-start for that tour only', () => {
    useOnboardingStore.getState().markSeen('home');
    expect(shouldAutoStart('home')).toBe(false);
    expect(shouldAutoStart('draft')).toBe(true);
  });

  it('skipAllTours stops every auto-start', () => {
    useOnboardingStore.getState().skipAllTours();
    expect(shouldAutoStart('home')).toBe(false);
    expect(shouldAutoStart('season')).toBe(false);
  });

  it('resetTours clears seen tours and skipAll', () => {
    const { markSeen, skipAllTours, resetTours } = useOnboardingStore.getState();
    markSeen('home');
    skipAllTours();
    resetTours();
    expect(shouldAutoStart('home')).toBe(true);
    expect(useOnboardingStore.getState().skipAll).toBe(false);
  });

  it('persists seen tours under its own localStorage key', () => {
    useOnboardingStore.getState().markSeen('draft');
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state).toEqual({ seen: { draft: true }, skipAll: false });
  });

  it('keeps working in memory when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => useOnboardingStore.getState().markSeen('season')).not.toThrow();
    expect(useOnboardingStore.getState().seen.season).toBe(true);
    spy.mockRestore();
  });
});

describe('glossary panel state', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ glossaryOpen: false, glossaryFocus: null });
  });

  it('opens at a term and closes again', () => {
    useOnboardingStore.getState().openGlossary('pwar');
    expect(useOnboardingStore.getState()).toMatchObject({ glossaryOpen: true, glossaryFocus: 'pwar' });
    useOnboardingStore.getState().closeGlossary();
    expect(useOnboardingStore.getState()).toMatchObject({ glossaryOpen: false, glossaryFocus: null });
  });

  it('does not persist panel state', () => {
    useOnboardingStore.getState().openGlossary();
    const raw = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) ?? '{"state":{}}');
    expect(raw.state).not.toHaveProperty('glossaryOpen');
  });
});
