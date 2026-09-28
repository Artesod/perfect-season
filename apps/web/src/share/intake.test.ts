import { afterEach, describe, expect, it } from 'vitest';
import { consumeChallengeFromUrl } from './intake';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('consumeChallengeFromUrl', () => {
  it('returns null and leaves the URL alone without a challenge', () => {
    window.history.replaceState(null, '', '/?foo=1');
    expect(consumeChallengeFromUrl()).toBeNull();
    expect(window.location.search).toBe('?foo=1');
  });

  it('reads the challenge and strips only its own params', () => {
    window.history.replaceState(
      null,
      '',
      '/?c=1&seed=5&asc=0&pool=procedural&casual=0&w=10&l=1&r=lost&fbclid=abc&utm_source=x',
    );
    expect(consumeChallengeFromUrl()).toMatchObject({ seed: 5, wins: 10, losses: 1 });
    expect(window.location.search).toBe('?fbclid=abc&utm_source=x');
  });

  it('leaves an invalid challenge URL untouched', () => {
    window.history.replaceState(null, '', '/?c=1&seed=oops');
    expect(consumeChallengeFromUrl()).toBeNull();
    expect(window.location.search).toBe('?c=1&seed=oops');
  });
});
