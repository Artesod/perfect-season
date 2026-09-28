import { describe, expect, it } from 'vitest';
import type { ChallengeParams } from './challengeLink';
import { prefillFromChallenge, type SetupFields } from './prefill';

const defaults: SetupFields = { seedText: '111', ascension: 0, poolMode: 'current', casual: false };
const challenge: ChallengeParams = {
  seed: 48213,
  ascension: 1,
  pool: 'classic',
  casual: true,
  wins: 71,
  losses: 11,
  result: 'lost',
  datasetVersion: null,
};
const all = () => true;

describe('prefillFromChallenge', () => {
  it('keeps defaults without a challenge', () => {
    expect(prefillFromChallenge(null, defaults, 3, all)).toEqual(defaults);
  });
  it('copies the challenge setup', () => {
    expect(prefillFromChallenge(challenge, defaults, 3, all)).toEqual({
      seedText: '48213',
      ascension: 1,
      poolMode: 'classic',
      casual: true,
    });
  });
  it('clamps a locked ascension to the highest unlocked level', () => {
    expect(prefillFromChallenge({ ...challenge, ascension: 5 }, defaults, 2, all).ascension).toBe(
      2,
    );
  });
  it('keeps the default pool when the challenge pool is unavailable', () => {
    expect(prefillFromChallenge(challenge, defaults, 3, (m) => m !== 'classic').poolMode).toBe(
      'current',
    );
  });
});
