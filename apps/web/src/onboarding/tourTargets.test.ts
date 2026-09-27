import { describe, expect, it } from 'vitest';
import draftSource from '../screens/DraftScreen.tsx?raw';
import homeSource from '../screens/HomeScreen.tsx?raw';
import seasonSource from '../screens/SeasonScreen.tsx?raw';
import type { TourId } from './onboardingStore';
import { TOURS } from './tours';

const SOURCES: Record<TourId, string> = {
  home: homeSource,
  draft: draftSource,
  season: seasonSource,
};

describe('tour targets', () => {
  for (const [id, steps] of Object.entries(TOURS) as [TourId, (typeof TOURS)[TourId]][]) {
    it(`every ${id} step targets a data-tour attribute on its screen`, () => {
      for (const step of steps) {
        expect(SOURCES[id], step.target).toContain(`data-tour="${step.target}"`);
      }
    });

    it(`the ${id} screen calls useTour('${id}'`, () => {
      expect(SOURCES[id]).toContain(`useTour('${id}'`);
    });
  }
});
