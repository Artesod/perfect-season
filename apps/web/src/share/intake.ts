import { CHALLENGE_KEYS, decodeChallenge, type ChallengeParams } from './challengeLink';

/**
 * Read a challenge from the page URL once at startup, then strip its params
 * so a reload or bookmark doesn't re-open it. Other params are kept.
 */
export function consumeChallengeFromUrl(): ChallengeParams | null {
  const challenge = decodeChallenge(window.location.search);
  if (!challenge) return null;
  const url = new URL(window.location.href);
  for (const key of CHALLENGE_KEYS) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', url);
  return challenge;
}
