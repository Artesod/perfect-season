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
import { canPickPlayer, canReroll, createRollDraft, pickPlayer, rerollTeam } from './draft';
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
import { generateLeague, generatePlayer } from './league';
import { buildRealLeague, sampleRealFreeAgents, type PoolSource } from './realPlayers';
import { generateSchedule, simulateScheduledGame } from './season';

/**
 * The run loop: drafting -> in-season -> won/lost, as pure transitions over
 * RunState. Every random draw comes from a seed derived from (run seed,
 * stream), so a run replays identically regardless of when saves/loads
 * happen or how the UI batches calls.
 */

// Seed streams. Games use GAME_STREAM_BASE + gameIndex; draft team rolls
// live at 30_000+ (see draft.ts).
const LEAGUE_STREAM = 0;
const LEAGUE_TOPUP_STREAM = 1;
const SCHEDULE_STREAM = 2;
const GAME_STREAM_BASE = 100;
const EVENT_STREAM_BASE = 10_000;
const FREE_AGENT_STREAM_BASE = 20_000;

export const USER_TEAM_ID = 'user';

/** Free-agent pool refreshes every this many games. */
export const FA_REFRESH_INTERVAL = 10;

/**
 * Extra cap room in casual mode, in millions. Sized to cancel out even the
 * max-ascension squeeze; at ascension 0 it still leaves a real trade-off
 * (three supermax deals eat ~$150M of the $180M effective cap).
 */
export const CASUAL_CAP_BONUS = 25;

/**
 * Effective cap tightening for this run: ascension squeeze minus casual
 * relief. Negative means extra room. Every cap check (draft, signing,
 * validation) and the UI's cap math must go through this.
 */
export function runCapReduction(run: RunState): number {
  return difficultyFor(run.ascension).capReduction - (run.casual ? CASUAL_CAP_BONUS : 0);
}

/**
 * Start a run. With a real-player pool (current rosters, classic teams,
 * all-time teams, or mixed — a bare NbaDataset means current), the league
 * comes from real rosters and one seeded team is replaced by the user's;
 * without one, everything is procedurally generated. Drafting is the same
 * in both modes: teams are rolled from the league and picked from directly.
 * Same seed + same pool = same run.
 */
export function createRun(
  seed: number,
  ascension = 0,
  dataset?: PoolSource,
  casual = false,
): RunState {
  const mods = difficultyFor(ascension);
  const league = dataset
    ? buildRealLeague(dataset, createRng(deriveSeed(seed, LEAGUE_STREAM)), mods.cpuOverallBonus)
    : generateLeague(createRng(deriveSeed(seed, LEAGUE_STREAM)), {
        minOverall: 55 + mods.cpuOverallBonus,
        maxOverall: 92 + mods.cpuOverallBonus,
      });
  return {
    seed,
    ascension,
    casual,
    livesRemaining: mods.lives,
    league,
    draft: createRollDraft(seed, league),
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

/** Draft the given player from the currently rolled team. */
export function runPickPlayer(run: RunState, playerId: string): RunState {
  requireStatus(run, 'drafting', 'draft');
  return {
    ...run,
    draft: pickPlayer(run.draft!, run.league, run.seed, playerId, runCapReduction(run)),
  };
}

export function runCanPick(run: RunState, playerId: string) {
  return canPickPlayer(run.draft!, run.league, playerId, runCapReduction(run));
}

export function runCanReroll(run: RunState) {
  return canReroll(run.draft!, run.league, runCapReduction(run));
}

/** Roll a different team for the current round (free if no legal pick exists). */
export function runRerollTeam(run: RunState): RunState {
  requireStatus(run, 'drafting', 'reroll');
  return { ...run, draft: rerollTeam(run.draft!, run.league, run.seed, runCapReduction(run)) };
}

/** CPU rosters below this get seeded fill-ins (teamStrength weighs a 10-man rotation). */
const CPU_MIN_ROSTER = 10;

/**
 * Lock the drafted roster and generate the season schedule. Drafted players
 * leave their CPU teams — taking a star weakens the team you'll face — with
 * seeded fill-ins keeping every roster at rotation depth.
 */
export function startSeason(run: RunState): RunState {
  requireStatus(run, 'drafting', 'start the season');
  const roster = run.draft!.roster;
  const validation = validateRoster(roster, runCapReduction(run));
  if (!validation.valid) {
    throw new Error(`Roster is not legal: ${validation.errors.join('; ')}`);
  }

  const draftedIds = new Set(roster.map((p) => p.id));
  const topUpRng = createRng(deriveSeed(run.seed, LEAGUE_TOPUP_STREAM));
  const league = run.league.map((team) => {
    const players = team.players.filter((p) => !draftedIds.has(p.id));
    // Length comparison alone can't detect changes: a short era roster that
    // loses a pick gets topped back up to the same size.
    const untouched = players.length === team.players.length;
    while (players.length < CPU_MIN_ROSTER) {
      players.push(generatePlayer(topUpRng, { minOverall: 55, maxOverall: 70 }));
    }
    return untouched && players.length === team.players.length ? team : { ...team, players };
  });

  const schedule = generateSchedule(
    createRng(deriveSeed(run.seed, SCHEDULE_STREAM)),
    league.map((t) => t.id),
  );
  return {
    ...run,
    league,
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

/**
 * Current free-agent pool; refreshes deterministically every few games.
 * Pass the same pool the run was created with so real-mode runs draw
 * free agents from real players (undrafted, waived, or unrostered).
 */
export function currentFreeAgents(run: RunState, dataset?: PoolSource): Player[] {
  requireStatus(run, 'in-season', 'browse free agents');
  const poolIndex = Math.floor(run.season!.results.length / FA_REFRESH_INTERVAL);
  const rng = createRng(deriveSeed(run.seed, FREE_AGENT_STREAM_BASE + poolIndex));
  if (dataset) {
    const excludeIds = new Set(
      [...run.roster, ...run.league.flatMap((t) => t.players)].map((p) => p.id),
    );
    return sampleRealFreeAgents(dataset, rng, excludeIds);
  }
  return generateFreeAgents(rng);
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
  const capReduction = runCapReduction(run);
  const check = canSign(run.roster, player, season.deadCap + capReduction);
  if (!check.ok) {
    throw new Error(`Cannot sign: ${check.detail}`);
  }
  return { ...run, roster: signPlayer(run.roster, player, season.deadCap + capReduction) };
}
