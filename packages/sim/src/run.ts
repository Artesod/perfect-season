import {
  createRng,
  deriveSeed,
  type EventCard,
  type PendingCard,
  type PendingNagging,
  type Player,
  type Position,
  type RunState,
  type Team,
} from '@perfect-season/shared';
import { validateRoster } from './cap';
import { cohesionAfterGame, cohesionAfterSigning, computeChemistry } from './chemistry';
import { difficultyFor } from './difficulty';
import { canPickPlayer, canReroll, createRollDraft, pickPlayer, rerollTeam } from './draft';
import {
  applyEvent,
  availableRoster,
  BASE_EVENT_CHANCES,
  emptyActiveEffects,
  resolveCardChoice,
  resolveNagging,
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
 * Effective cap tightening for this run: the ascension squeeze, or -Infinity
 * in casual mode — casual removes the cap entirely, so every cap check
 * (which all compare against remaining space) trivially passes. Every cap
 * check (draft, signing, validation) and the UI's cap math must go through
 * this; UI code should special-case the non-finite value instead of
 * rendering it.
 */
export function runCapReduction(run: RunState): number {
  return run.casual ? Number.NEGATIVE_INFINITY : difficultyFor(run.ascension).capReduction;
}

/**
 * Casual mode's CPU handicap, in overall points. Casual is the power-
 * fantasy mode: no cap plus softer opponents, so a stacked roster actually
 * stomps. Applied to CPU rosters at season start — after drafting — so the
 * players you draft keep their full ratings; weakening the league at
 * creation would weaken your own draft pool by the same amount and cancel
 * itself out.
 */
export const CASUAL_CPU_REDUCTION = 4;

/**
 * Lives in casual mode: the season survives up to 7 losses instead of
 * ending on the first. A well-drafted all-time superteam still drops 4-5
 * games per 82 under the current sim, so with one life 82-0 is nearly
 * impossible (~8%); eight lives make a dominant casual roster win ~85% of
 * its runs while a mediocre one still fails.
 */
export const CASUAL_LIVES = 8;

/** Net CPU overall adjustment the user's opponents end up with in-season. */
export function runCpuBonus(ascension: number, casual: boolean): number {
  return difficultyFor(ascension).cpuOverallBonus - (casual ? CASUAL_CPU_REDUCTION : 0);
}

/** Lives a run starts with. */
export function runLives(ascension: number, casual: boolean): number {
  return casual ? CASUAL_LIVES : difficultyFor(ascension).lives;
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
    livesRemaining: runLives(ascension, casual),
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

/**
 * Draft the given player from the currently rolled team, optionally as a
 * specific eligible position (dual-position players).
 */
export function runPickPlayer(run: RunState, playerId: string, asPosition?: Position): RunState {
  requireStatus(run, 'drafting', 'draft');
  return {
    ...run,
    draft: pickPlayer(run.draft!, run.league, run.seed, playerId, runCapReduction(run), asPosition),
  };
}

export function runCanPick(run: RunState, playerId: string, asPosition?: Position) {
  return canPickPlayer(run.draft!, run.league, playerId, runCapReduction(run), asPosition);
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
 * seeded fill-ins keeping every roster at rotation depth. Casual runs apply
 * the CPU handicap here, after drafting, so drafted players keep their full
 * ratings.
 */
export function startSeason(run: RunState): RunState {
  requireStatus(run, 'drafting', 'start the season');
  const roster = run.draft!.roster;
  const validation = validateRoster(roster, runCapReduction(run));
  if (!validation.valid) {
    throw new Error(`Roster is not legal: ${validation.errors.join('; ')}`);
  }

  const clampRating = (n: number) => Math.min(99, Math.max(40, n));
  const casualAdjust = run.casual ? -CASUAL_CPU_REDUCTION : 0;
  const draftedIds = new Set(roster.map((p) => p.id));
  const topUpRng = createRng(deriveSeed(run.seed, LEAGUE_TOPUP_STREAM));
  const league = run.league.map((team) => {
    let players = team.players.filter((p) => !draftedIds.has(p.id));
    // Length comparison alone can't detect changes: a short era roster that
    // loses a pick gets topped back up to the same size.
    const untouched = players.length === team.players.length && casualAdjust === 0;
    if (casualAdjust !== 0) {
      players = players.map((p) => ({
        ...p,
        overall: clampRating(p.overall + casualAdjust),
        offense: clampRating(p.offense + casualAdjust),
        defense: clampRating(p.defense + casualAdjust),
      }));
    }
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
      pendingNagging: null,
      cohesion: 0,
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
 * Pending decisions (morale card, nagging injury) must be resolved first.
 * Pass the authored card pool so morale events can fire; omit it and they
 * simply don't.
 */
export function playNextGame(run: RunState, cards: readonly EventCard[] = []): RunState {
  requireStatus(run, 'in-season', 'play a game');
  const season = run.season!;
  if (season.pendingCard || season.pendingNagging) {
    throw new Error('Resolve the pending decision (event card / nagging injury) before playing');
  }

  const gameIndex = season.results.length;
  const scheduled = season.schedule[gameIndex];
  const opponent = run.league.find((t) => t.id === scheduled.opponentTeamId)!;
  const gameRng = createRng(deriveSeed(run.seed, GAME_STREAM_BASE + gameIndex));
  const result = simulateScheduledGame(userTeam(run), scheduled, opponent, gameRng, season.cohesion);

  const won = result.winnerTeamId === USER_TEAM_ID;
  const wins = run.wins + (won ? 1 : 0);
  const losses = run.losses + (won ? 0 : 1);
  const livesRemaining = run.livesRemaining - (won ? 0 : 1);
  const cohesion = cohesionAfterGame(season.cohesion, won);

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
  let pendingNagging: PendingNagging | null = null;

  if (status === 'in-season') {
    const mods = difficultyFor(run.ascension);
    const eventRng = createRng(deriveSeed(run.seed, EVENT_STREAM_BASE + gameIndex));
    const available = availableRoster(run.roster, effects);
    const chemistry = new Map(
      computeChemistry(available, cohesion).map((e) => [e.id, e.playerIds] as const),
    );
    const rolled = rollEvents(available, eventRng, {
      chances: scaleChances(BASE_EVENT_CHANCES, mods.eventChanceMultiplier),
      cards,
      chemistry,
      nextOpponentTeamId: season.schedule[gameIndex + 1]?.opponentTeamId,
    });
    for (const event of rolled) {
      events.push(event);
      if (event.type === 'morale') {
        pendingCard = { cardId: event.cardId, playerIds: event.playerIds };
      } else if (event.type === 'nagging') {
        pendingNagging = {
          playerId: event.playerId,
          playHurtDelta: event.playHurtDelta,
          playHurtGames: event.playHurtGames,
          sitGames: event.sitGames,
        };
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
    season: {
      ...season,
      results: [...season.results, result],
      events,
      effects,
      pendingCard,
      pendingNagging,
      cohesion,
    },
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
  const { effects, cohesionDelta } = resolveCardChoice(
    season.effects,
    card,
    choiceId,
    season.pendingCard.playerIds,
    run.roster.map((p) => p.id),
  );
  return {
    ...run,
    season: {
      ...season,
      effects,
      pendingCard: null,
      cohesion: Math.min(1, Math.max(0, season.cohesion + cohesionDelta)),
    },
  };
}

/** Resolve a pending nagging-injury decision: play him hurt or sit him. */
export function runResolveNagging(run: RunState, choice: 'play' | 'sit'): RunState {
  const season = run.season;
  if (!season?.pendingNagging) {
    throw new Error('No pending nagging injury to resolve');
  }
  const effects = resolveNagging(season.effects, season.pendingNagging, choice);
  return { ...run, season: { ...season, effects, pendingNagging: null } };
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
    season: {
      ...season,
      deadCap: season.deadCap + deadCapIncurred,
      effects: cleaned,
      pendingNagging: season.pendingNagging?.playerId === playerId ? null : season.pendingNagging,
    },
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
  return {
    ...run,
    roster: signPlayer(run.roster, player, season.deadCap + capReduction),
    season: { ...season, cohesion: cohesionAfterSigning(season.cohesion) },
  };
}
