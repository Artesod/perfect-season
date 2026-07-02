import type { GameResult, Rng, Team } from '@perfect-season/shared';

/**
 * Game simulation v1: team strength from the top of the rotation, a logistic
 * win-probability model with home-court advantage, and a plausible score.
 * This is a deliberately simple placeholder — see docs/GAME_DESIGN.md for
 * where this is headed (chemistry modifiers, fatigue, events).
 */

const HOME_COURT_BONUS = 1.5;
/** Rating-difference scale for the logistic curve; higher = upsets more likely */
const UPSET_FACTOR = 6;

export function teamStrength(team: Team): number {
  // Weight the best players heaviest, mimicking a real rotation.
  const sorted = [...team.players].sort((a, b) => b.overall - a.overall);
  const weights = [1, 0.95, 0.9, 0.85, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2];
  let total = 0;
  let weightSum = 0;
  sorted.slice(0, weights.length).forEach((p, i) => {
    total += p.overall * weights[i];
    weightSum += weights[i];
  });
  return weightSum > 0 ? total / weightSum : 0;
}

export function homeWinProbability(home: Team, away: Team): number {
  const diff = teamStrength(home) + HOME_COURT_BONUS - teamStrength(away);
  return 1 / (1 + Math.exp(-diff / UPSET_FACTOR));
}

export function simulateGame(home: Team, away: Team, rng: Rng): GameResult {
  const homeWinProb = homeWinProbability(home, away);
  const homeWins = rng() < homeWinProb;

  const winnerScore = 95 + Math.floor(rng() * 40);
  const margin = 1 + Math.floor(rng() * 25);
  const loserScore = winnerScore - margin;

  return {
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeScore: homeWins ? winnerScore : loserScore,
    awayScore: homeWins ? loserScore : winnerScore,
    winnerTeamId: homeWins ? home.id : away.id,
    homeWinProbability: homeWinProb,
  };
}
