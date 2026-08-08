import {
  pick,
  shuffle,
  type GameResult,
  type Rng,
  type ScheduledGame,
  type Team,
} from '@perfect-season/shared';
import { cohesionAfterGame, CPU_COHESION } from './chemistry';
import { simulateGame } from './game';

export const SEASON_LENGTH = 82;

/**
 * Build an 82-game schedule against the CPU teams: every opponent home and
 * away once (58 games with 29 teams), remaining games against random
 * opponents, then a seeded shuffle so matchups spread across the season.
 */
export function generateSchedule(rng: Rng, opponentTeamIds: readonly string[]): ScheduledGame[] {
  if (opponentTeamIds.length === 0) {
    throw new Error('generateSchedule requires at least one opponent');
  }

  const games: ScheduledGame[] = [];
  for (const opponentTeamId of opponentTeamIds) {
    games.push({ opponentTeamId, isHome: true });
    games.push({ opponentTeamId, isHome: false });
  }
  while (games.length < SEASON_LENGTH) {
    games.push({ opponentTeamId: pick(rng, opponentTeamIds), isHome: rng() < 0.5 });
  }

  return shuffle(rng, games).slice(0, SEASON_LENGTH);
}

export interface SeasonOutcome {
  results: GameResult[];
  wins: number;
  losses: number;
}

export interface SimulateSeasonOptions {
  /** Perfect-season mode: stop simulating at the first loss (default true) */
  stopOnLoss?: boolean;
}

/** Play a single scheduled game from the user team's perspective. */
export function simulateScheduledGame(
  userTeam: Team,
  game: ScheduledGame,
  opponent: Team,
  rng: Rng,
  userCohesion = 0,
): GameResult {
  return game.isHome
    ? simulateGame(userTeam, opponent, rng, userCohesion, CPU_COHESION)
    : simulateGame(opponent, userTeam, rng, CPU_COHESION, userCohesion);
}

export function simulateSeason(
  userTeam: Team,
  cpuTeams: readonly Team[],
  schedule: readonly ScheduledGame[],
  rng: Rng,
  options: SimulateSeasonOptions = {},
): SeasonOutcome {
  const stopOnLoss = options.stopOnLoss ?? true;
  const teamsById = new Map(cpuTeams.map((t) => [t.id, t]));

  const results: GameResult[] = [];
  let wins = 0;
  let losses = 0;
  let cohesion = 0;

  for (const game of schedule) {
    const opponent = teamsById.get(game.opponentTeamId);
    if (!opponent) {
      throw new Error(`Unknown opponent team id in schedule: ${game.opponentTeamId}`);
    }
    const result = simulateScheduledGame(userTeam, game, opponent, rng, cohesion);
    results.push(result);

    const won = result.winnerTeamId === userTeam.id;
    cohesion = cohesionAfterGame(cohesion, won);
    if (won) {
      wins++;
    } else {
      losses++;
      if (stopOnLoss) break;
    }
  }

  return { results, wins, losses };
}
