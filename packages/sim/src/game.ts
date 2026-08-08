import type { GameResult, Rng, Team } from '@perfect-season/shared';
import { chemistryDelta, CPU_COHESION } from './chemistry';

/**
 * Game simulation: team strength from the top of the rotation plus chemistry
 * modifiers, a logistic win-probability model with home-court advantage, and
 * a plausible score. See docs/GAME_DESIGN.md for where this is headed
 * (fatigue, in-game events).
 */

const HOME_COURT_BONUS = 1;
/**
 * Rating-difference scale for the logistic curve; higher = upsets more
 * likely. At 3.5, a +9 strength edge (a stacked roster vs an average
 * opponent) wins ~92% of games and near-equal matchups stay tense; the old
 * value of 6 capped even the best rosters near ~82% per game, which made
 * every run die early regardless of draft quality. Home bonus of 1 puts
 * equal-team home games at ~57%, matching real NBA home-court advantage.
 */
const UPSET_FACTOR = 3.5;

/** Rotation-weighted rating aggregate, before chemistry. */
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

/** Ratings plus chemistry — what games are actually decided on. */
export function effectiveStrength(team: Team, cohesion = CPU_COHESION): number {
  return teamStrength(team) + chemistryDelta(team.players, cohesion);
}

export function homeWinProbability(
  home: Team,
  away: Team,
  homeCohesion = CPU_COHESION,
  awayCohesion = CPU_COHESION,
): number {
  const diff =
    effectiveStrength(home, homeCohesion) +
    HOME_COURT_BONUS -
    effectiveStrength(away, awayCohesion);
  return 1 / (1 + Math.exp(-diff / UPSET_FACTOR));
}

export function simulateGame(
  home: Team,
  away: Team,
  rng: Rng,
  homeCohesion = CPU_COHESION,
  awayCohesion = CPU_COHESION,
): GameResult {
  const homeWinProb = homeWinProbability(home, away, homeCohesion, awayCohesion);
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
