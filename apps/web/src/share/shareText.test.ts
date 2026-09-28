import { describe, expect, it } from 'vitest';
import { runLives } from '@perfect-season/sim';
import { buildShareText, runHeadline, runTags, type FinishedRunSummary } from './shareText';

const base: FinishedRunSummary = {
  seed: 48213,
  ascension: 2,
  casual: false,
  wins: 82,
  losses: 0,
  livesRemaining: 1,
  status: 'won',
};

describe('runHeadline', () => {
  it('names a perfect season', () => {
    expect(runHeadline(base)).toEqual({ kicker: 'Perfect season', headline: '82–0' });
  });
  it('names a survived season', () => {
    expect(runHeadline({ ...base, wins: 79, losses: 3 })).toEqual({
      kicker: 'Season survived',
      headline: '79–3',
    });
  });
  it('names a lost run', () => {
    expect(runHeadline({ ...base, wins: 47, losses: 12, status: 'lost' })).toEqual({
      kicker: 'Run over',
      headline: '47–12',
    });
  });
});

describe('buildShareText', () => {
  it('brags about 82–0', () => {
    expect(buildShareText(base)).toBe(
      'Went 82–0 in Perfect Season 🏆 Asc 2 · seed 48213. Can you beat it?',
    );
  });
  it('describes a survived season', () => {
    expect(buildShareText({ ...base, wins: 79, losses: 3 })).toBe(
      'Survived the season at 79–3 in Perfect Season. Asc 2 · seed 48213. Can you beat it?',
    );
  });
  it('describes a lost run and marks casual', () => {
    expect(buildShareText({ ...base, wins: 47, losses: 12, status: 'lost', casual: true })).toBe(
      'Made it to 47–12 in Perfect Season. Asc 2 · seed 48213 · casual. Can you beat it?',
    );
  });
});

describe('runTags', () => {
  it('lists ascension and pool', () => {
    const lives = runLives(0, false);
    const tags = runTags({ ...base, ascension: 0, livesRemaining: lives }, 'current');
    expect(tags.slice(0, 2)).toEqual(['Asc 0', 'Current NBA']);
  });
  it('adds casual and lives used when the run has several lives', () => {
    const lives = runLives(0, true);
    const tags = runTags(
      { ...base, ascension: 0, casual: true, livesRemaining: lives - 2 },
      'procedural',
    );
    expect(tags).toEqual(['Asc 0', 'Fictional', 'Casual', `Lives used 2/${lives}`]);
  });
  it('never reports more lives used than the run had', () => {
    const lives = runLives(0, true);
    const tags = runTags(
      { ...base, casual: true, ascension: 0, livesRemaining: -1, status: 'lost' },
      'mixed',
    );
    expect(tags).toContain(`Lives used ${lives}/${lives}`);
  });
});
