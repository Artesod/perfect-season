import type { ChallengeParams, PoolChoice } from './challengeLink';

export interface SetupFields {
  seedText: string;
  ascension: number;
  poolMode: PoolChoice;
  casual: boolean;
}

/**
 * Home's new-run fields, seeded from a pending challenge. The ascension picker
 * can't show a locked level, so it's clamped; the banner's Start button still
 * plays the challenge's real ascension.
 */
export function prefillFromChallenge(
  challenge: ChallengeParams | null,
  defaults: SetupFields,
  maxUnlocked: number,
  poolAvailable: (mode: PoolChoice) => boolean,
): SetupFields {
  if (!challenge) return defaults;
  return {
    seedText: String(challenge.seed),
    ascension: Math.min(challenge.ascension, maxUnlocked),
    poolMode: poolAvailable(challenge.pool) ? challenge.pool : defaults.poolMode,
    casual: challenge.casual,
  };
}
