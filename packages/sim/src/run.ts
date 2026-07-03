import {
  createRng,
  deriveSeed,
  type EventCard,
  type PendingCard,
  type Player,
  type RunState,
  type Team,
} from '@perfect-season/shared';
import { validateRoster } from './cap';
import { difficultyFor } from './difficulty';
import { canDraft, draftPlayer, startDraft, undraftPlayer } from './draft';
import {
  applyEvent,
  availableRoster,
  BASE_EVENT_CHANCES,
  emptyActiveEffects,
  resolveCardChoice,
  rollEvents,
  scaleChances,
  tickEffects,
} from './events';
import { canSign, generateFreeAgents, signPlayer, waivePlayer } from './freeAgency';
import { generateLeague } from './league';
import { generateSchedule, simulateScheduledGame } from './season';

/**
 * The run loop: drafting -> in-season -> won/lost, as pure transitions over
 * RunState. Every random draw comes from a seed derived from (run seed,
 * stream), so a run replays identically regardless of when saves/loads
 * happen or how the UI batches calls.
 */

// Seed streams. Games use GAME_STREAM_BASE + gameIndex.
const LEAGUE_STREAM = 0;
const DRAFT_STREAM = 1;
const SCHEDULE_STREAM = 2;
const GAME_STREAM_BASE = 100;
const EVENT_STREAM_BASE = 10_000;
const FREE_AGENT_STREAM_BASE = 20_000;

export const USER_TEAM_ID = 'user';

/** Free-agent pool refreshes every this many games. */
export const FA_REFRESH_INTERVAL = 10;

export function createRun(seed: number, ascension = 0): RunState {
  const mods = difficultyFor(ascension);
  const league = generateLeague(createRng(deriveSeed(seed, LEAGUE_STREAM)), {
    minOverall: 55 + mods.cpuOverallBonus,
    maxOverall: 92 + mods.cpuOverallBonus,
  });
  return {
    seed,
    ascension,
    livesRemaining: mods.lives,
    league,
    draft: startDraft(createRng(deriveSeed(seed, DRAFT_STREAM))),
    roster: [],
    season: null,
    wins: 0,
    losses: 0,
    status: 'drafting',
  };
}

function requireStatus(run: RunState, status: RunState['status'], action: string): void {
  if (run.status !== status) {
    throw new Error(`Cannot ${action} while run status is '${run.status}'`);
  }
}

export function runDraftPlayer(run: RunState, playerId: string): RunState {
  requireStatus(run, 'drafting', 'draft');
  const mods = difficultyFor(run.ascension);
  return { ...run, draft: draftPlayer(run.draft!, playerId, mods.capReduction) };
}

export function runUndraftPlayer(run: RunState, playerId: string): RunState {
  requireStatus(run, 'drafting', 'undraft');
  return { ...run, draft: undraftPlayer(run.draft!, playerId) };
}

export function runCanDraft(run: RunState, playerId: string) {
  return canDraft(run.draft!, playerId, difficultyFor(run.ascension).capReduction);
}

/** Lock the drafted roster and generate the season schedule. */
export function startSeason(run: RunState): RunState {
  requireStatus(run, 'drafting', 'start the season');
  const roster = run.draft!.roster;
  const validation = validateRoster(roster, difficultyFor(run.ascension).capReduction);
  if (!validation.valid) {
    throw new Error(`Roster is not legal: ${validation.errors.join('; ')}`);
  }
  const schedule = generateSchedule(
    createRng(deriveSeed(run.seed, SCHEDULE_STREAM)),
    run.league.map((t) => t.id),
  );
  return {
    ...run,
    draft: null,
    roster,
    season: {
      schedule,
      results: [],
      events: [],
      effects: emptyActiveEffects(),
      deadCap: 0,
      pendingCard: null,
    },
    status: 'in-season',
  };
}

function userTeam(run: RunState): Team {
  return {
    id: USER_TEAM_ID,
    name: 'Your Team',
    players: availableRoster(run.roster, run.season!.effects),
  };
}

/**
 * Play the next scheduled game, tick effects, then roll fresh events.
 * A pending morale card must be resolved first. Pass the authored card pool
 * so morale events can fire; omit it and they simply don't.
 */
export function playNextGame(run: RunState, cards: readonly EventCard[] = []): RunState {
  requireStatus(run, 'in-season', 'play a game');
  const season = run.season!;
  if (season.pendingCard) {
    throw new Error('Resolve the pending event card before playing the next game');
  }

  const gameIndex = season.results.length;
  const scheduled = season.schedule[gameIndex];
  const opponent = run.league.find((t) => t.id === scheduled.opponentTeamId)!;
  const gameRng = createRng(deriveSeed(run.seed, GAME_STREAM_BASE + gameIndex));
  const result = simulateScheduledGame(userTeam(run), scheduled, opponent, gameRng);

  const won = result.winnerTeamId === USER_TEAM_ID;
  const wins = run.wins + (won ? 1 : 0);
  const losses = run.losses + (won ? 0 : 1);
  const livesRemaining = run.livesRemaining - (won ? 0 : 1);

  let status: RunState['status'] = run.status;
  if (livesRemaining <= 0) {
    status = 'lost';
  } else if (wins + losses >= season.schedule.length) {
    // Regular season survived. Becomes 'playoffs' once the playoff sim exists.
    status = 'won';
  }

  // Heal/expire one game's worth, then roll new events.
  let effects = tickEffects(season.effects);
  const events = [...season.events];
  let pendingCard: PendingCard | null = null;

  if (status === 'in-season') {
    const mods = difficultyFor(run.ascension);
    const eventRng = createRng(deriveSeed(run.seed, EVENT_STREAM_BASE + gameIndex));
    const rolled = rollEvents(
      availableRoster(run.roster, effects),
      eventRng,
      scaleChances(BASE_EVENT_CHANCES, mods.eventChanceMultiplier),
      cards,
    );
    for (const event of rolled) {
      events.push(event);
      if (event.type === 'morale') {
        pendingCard = { cardId: event.cardId, playerIds: event.playerIds };
      } else {
        effects = applyEvent(effects, event);
      }
    }
  }

  return {
    ...run,
    wins,
    losses,
    livesRemaining,
    status,
    season: { ...season, results: [...season.results, result], events, effects, pendingCard },
  };
}

/** Resolve the pending morale card with the player's chosen option. */
export function resolvePendingCard(
  run: RunState,
  cards: readonly EventCard[],
  choiceId: string,
): RunState {
  const season = run.season;
  if (!season?.pendingCard) {
    throw new Error('No pending event card to resolve');
  }
  const card = cards.find((c) => c.id === season.pendingCard!.cardId);
  if (!card) {
    throw new Error(`Unknown card id: ${season.pendingCard.cardId}`);
  }
  const effects = resolveCardChoice(
    season.effects,
    card,
    choiceId,
    season.pendingCard.playerIds,
    run.roster.map((p) => p.id),
  );
  return { ...run, season: { ...season, effects, pendingCard: null } };
}

/** Current free-agent pool; refreshes deterministically every few games. */
export function currentFreeAgents(run: RunState): Player[] {
  requireStatus(run, 'in-season', 'browse free agents');
  const poolIndex = Math.floor(run.season!.results.length / FA_REFRESH_INTERVAL);
  return generateFreeAgents(createRng(deriveSeed(run.seed, FREE_AGENT_STREAM_BASE + poolIndex)));
}

export function runWaivePlayer(run: RunState, playerId: string): RunState {
  requireStatus(run, 'in-season', 'waive');
  const season = run.season!;
  const { roster, deadCapIncurred } = waivePlayer(run.roster, playerId);
  // Clear any lingering effects on the departed player.
  const cleaned = {
    injuries: Object.fromEntries(
      Object.entries(season.effects.injuries).filter(([id]) => id !== playerId),
    ),
    ratingMods: Object.fromEntries(
      Object.entries(season.effects.ratingMods).filter(([id]) => id !== playerId),
    ),
  };
  return {
    ...run,
    roster,
    season: { ...season, deadCap: season.deadCap + deadCapIncurred, effects: cleaned },
  };
}

export function runSignPlayer(run: RunState, player: Player): RunState {
  requireStatus(run, 'in-season', 'sign');
  const season = run.season!;
  const capReduction = difficultyFor(run.ascension).capReduction;
  const check = canSign(run.roster, player, season.deadCap + capReduction);
  if (!check.ok) {
    throw new Error(`Cannot sign: ${check.detail}`);
  }
  return { ...run, roster: signPlayer(run.roster, player, season.deadCap + capReduction) };
}
