import type { ChallengeTarget } from '@perfect-season/shared';

export type ChallengeOutcome = 'beat' | 'tied' | 'fell-short';

/** Won beats lost; among wins fewer losses is better; among losses more wins is better */
function rank(result: ChallengeTarget): [number, number] {
  return result.result === 'won' ? [1, -result.losses] : [0, result.wins];
}

export function compareResults(mine: ChallengeTarget, theirs: ChallengeTarget): ChallengeOutcome {
  const [a1, a2] = rank(mine);
  const [b1, b2] = rank(theirs);
  if (a1 !== b1) return a1 > b1 ? 'beat' : 'fell-short';
  if (a2 !== b2) return a2 > b2 ? 'beat' : 'fell-short';
  return 'tied';
}

export function outcomeLabel(outcome: ChallengeOutcome): string {
  switch (outcome) {
    case 'beat':
      return 'challenge beaten';
    case 'tied':
      return 'tied the challenger';
    case 'fell-short':
      return 'fell short';
  }
}
