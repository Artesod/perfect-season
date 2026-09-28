import { describe, expect, it } from 'vitest';
import { MAX_ASCENSION, runLives } from '@perfect-season/sim';
import { decodeChallenge, encodeChallenge, type ChallengeParams } from './challengeLink';

const lost: ChallengeParams = {
  seed: 48213,
  ascension: 2,
  pool: 'current',
  casual: false,
  wins: 71,
  losses: 3,
  result: 'lost',
  datasetVersion: '2026-09-20',
};

const BASE = 'https://example.test/perfect-season/';

function searchOf(url: string): string {
  return new URL(url).search;
}

describe('encodeChallenge / decodeChallenge', () => {
  it('round-trips a challenge', () => {
    const url = encodeChallenge(lost, BASE);
    expect(url.startsWith(`${BASE}?`)).toBe(true);
    expect(decodeChallenge(searchOf(url))).toEqual(lost);
  });

  it('round-trips a perfect casual run', () => {
    const perfect: ChallengeParams = { ...lost, casual: true, wins: 82, losses: 0, result: 'won' };
    expect(decodeChallenge(searchOf(encodeChallenge(perfect, BASE)))).toEqual(perfect);
  });

  it('omits the dataset version for procedural runs', () => {
    const url = encodeChallenge({ ...lost, pool: 'procedural', datasetVersion: 'ignored' }, BASE);
    expect(new URL(url).searchParams.has('v')).toBe(false);
    expect(decodeChallenge(searchOf(url))?.datasetVersion).toBeNull();
  });

  it('reads a missing version as null', () => {
    const url = encodeChallenge({ ...lost, datasetVersion: null }, BASE);
    expect(decodeChallenge(searchOf(url))?.datasetVersion).toBeNull();
  });

  it('round-trips a negative seed the Home screen accepts', () => {
    const negative: ChallengeParams = { ...lost, seed: -5 };
    expect(decodeChallenge(searchOf(encodeChallenge(negative, BASE)))).toEqual(negative);
  });

  it('round-trips a 16-digit seed within the safe-integer range', () => {
    const big: ChallengeParams = { ...lost, seed: 1234567890123456 };
    expect(decodeChallenge(searchOf(encodeChallenge(big, BASE)))).toEqual(big);
  });

  it('ignores unrelated query params', () => {
    const url = `${encodeChallenge(lost, BASE)}&fbclid=abc&utm_source=x`;
    expect(decodeChallenge(searchOf(url))).toEqual(lost);
  });
});

describe('decodeChallenge rejects bad input', () => {
  const good = new URL(encodeChallenge(lost, BASE)).searchParams;

  function withParam(key: string, value: string | null): string {
    const q = new URLSearchParams(good);
    if (value === null) q.delete(key);
    else q.set(key, value);
    return `?${q.toString()}`;
  }

  it('returns null without the challenge marker', () => {
    expect(decodeChallenge('')).toBeNull();
    expect(decodeChallenge(withParam('c', null))).toBeNull();
    expect(decodeChallenge(withParam('c', '2'))).toBeNull();
  });

  it.each(['1e3', '--5', '-', '12.5', '+3', '', 'abc', '9999999999999999'])(
    'rejects seed %j',
    (seed) => {
      expect(decodeChallenge(withParam('seed', seed))).toBeNull();
    },
  );

  it('rejects out-of-range ascension', () => {
    expect(decodeChallenge(withParam('asc', String(MAX_ASCENSION + 1)))).toBeNull();
    expect(decodeChallenge(withParam('asc', '-1'))).toBeNull();
  });

  it('rejects unknown pool, casual, or result values', () => {
    expect(decodeChallenge(withParam('pool', 'wnba'))).toBeNull();
    expect(decodeChallenge(withParam('casual', 'true'))).toBeNull();
    expect(decodeChallenge(withParam('r', 'draw'))).toBeNull();
  });

  it('rejects missing fields', () => {
    for (const key of ['seed', 'asc', 'pool', 'casual', 'w', 'l', 'r']) {
      expect(decodeChallenge(withParam(key, null))).toBeNull();
    }
  });

  it('rejects impossible records', () => {
    expect(decodeChallenge(withParam('w', '80'))).toBeNull(); // 80 + 3 > 82
    const wonShort = new URLSearchParams(good);
    wonShort.set('r', 'won');
    wonShort.set('w', '80');
    wonShort.set('l', '2'); // 80 + 2 = 82 is fine…
    expect(decodeChallenge(`?${wonShort}`)).not.toBeNull();
    wonShort.set('w', '70'); // …but a won run must have played all 82
    expect(decodeChallenge(`?${wonShort}`)).toBeNull();
  });

  it('rejects records the sim cannot produce', () => {
    const lives = runLives(2, false);
    // A lost run has used every life
    expect(decodeChallenge(withParam('l', String(lives + 1)))).toBeNull();
    expect(decodeChallenge(withParam('l', '0'))).toBeNull();
    // A won run has lives left
    const won = new URLSearchParams(good);
    won.set('r', 'won');
    won.set('w', '0');
    won.set('l', '82');
    expect(decodeChallenge(`?${won}`)).toBeNull();
    won.set('w', String(82 - (lives - 1)));
    won.set('l', String(lives - 1));
    expect(decodeChallenge(`?${won}`)).not.toBeNull();
  });
});
