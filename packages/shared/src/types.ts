export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface Player {
  id: string;
  name: string;
  /** The position this player occupies (drafting a dual-position player assigns one) */
  position: Position;
  /**
   * Other positions the player can play (dual-position players on
   * 2kratings). At draft time the user chooses which eligible position the
   * pick fills; `position` is reassigned and this list re-derived.
   */
  altPositions?: Position[];
  /** Overall rating, roughly 40-99 like 2K scale */
  overall: number;
  offense: number;
  defense: number;
  /** Annual salary in millions */
  salary: number;
  /** Projected wins above replacement over a full season */
  pWAR: number;
  /** Playstyle traits used by the chemistry system, e.g. "playmaker", "rim-protector" */
  traits: string[];
  /** Headshot URL (real players only); UI falls back to a generic avatar */
  imageUrl?: string;
  /** Real-world per-game stats from last season (real players only), display-only */
  stats?: RealPlayerStats;
  /**
   * Real players only: normalized identity of the underlying person, shared
   * by every era version of them (e.g. '91 and '96 Jordan). Roster rules use
   * it to forbid two versions of the same person on one roster.
   */
  personKey?: string;
  /**
   * Era players only: the historical roster they came from (e.g. "1985-86
   * Chicago Bulls"), for display and era-based chemistry.
   */
  eraTeam?: string;
  /**
   * League team id the player was drafted off of (set at pick time).
   * Powers revenge-game events; absent for FA signings and CPU players.
   */
  originTeamId?: string;
}

export interface Team {
  id: string;
  name: string;
  players: Player[];
}

export interface GameResult {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string;
  /** Pre-game win probability for the home team, 0-1 */
  homeWinProbability: number;
}

export interface Contract {
  playerId: string;
  /** Annual salary in millions */
  salary: number;
  /** Seasons remaining, including the current one */
  yearsRemaining: number;
}

export type InjurySeverity = 'minor' | 'moderate' | 'severe';

/**
 * A random event fired between games. Content (descriptions, event cards) is
 * authored as static data; the engine only picks and applies events with the
 * seeded RNG so runs stay deterministic.
 */
export type SeasonEvent =
  | {
      type: 'injury';
      playerId: string;
      severity: InjurySeverity;
      /** Games the player will miss */
      gamesOut: number;
    }
  | {
      type: 'hot-streak';
      playerId: string;
      /** Temporary boost to overall while the streak lasts */
      ratingDelta: number;
      gamesRemaining: number;
    }
  | {
      type: 'slump';
      playerId: string;
      /** Negative delta applied while the slump lasts */
      ratingDelta: number;
      gamesRemaining: number;
    }
  | {
      type: 'illness';
      playerId: string;
      /** Short absence (flu, back spasms), distinct from injuries in the log */
      gamesOut: number;
    }
  | {
      type: 'suspension';
      playerId: string;
      gamesOut: number;
    }
  | {
      type: 'revenge';
      /** Player facing the team he was drafted off of next game */
      playerId: string;
      ratingDelta: number;
      gamesRemaining: number;
    }
  | {
      type: 'nagging';
      /** Nagging injury: blocks the next game until play/sit is chosen */
      playerId: string;
      playHurtDelta: number;
      playHurtGames: number;
      sitGames: number;
    }
  | {
      type: 'morale';
      /** Reference into the authored event-card pool in data/ */
      cardId: string;
      playerIds: string[];
    };

/** How a chemistry effect behaves as the team gels over a season. */
export type ChemistryKind = 'synergy' | 'friction' | 'structural';

/** A chemistry synergy/anti-synergy derived from roster composition. */
export interface ChemistryEffect {
  id: string;
  label: string;
  /** Applied to team strength; positive = synergy, negative = anti-synergy */
  strengthDelta: number;
  /** Players producing the effect */
  playerIds: string[];
  /**
   * friction fades with cohesion (and flips positive once resolved);
   * structural never fades; synergy deepens slightly with cohesion.
   */
  kind: ChemistryKind;
}

/**
 * Authored event-card content (locker-room scenarios with choices). Cards
 * live as static data in data/ — AI-generated at design time, validated
 * against this schema — and the engine references them by id.
 */
/**
 * Who a card effect hits: the involved players, the whole roster, the
 * highest-overall involved player (alpha), or every other involved player.
 */
export type CardTarget = 'involved' | 'team' | 'alpha' | 'supporting';

export type CardEffect =
  | {
      type: 'rating';
      /** Overall delta while active */
      delta: number;
      /** Games the effect lasts */
      games: number;
      target: CardTarget;
    }
  | {
      type: 'absence';
      /** Games the targeted players sit */
      games: number;
      target: CardTarget;
    }
  | {
      type: 'cohesion';
      /** Added to season cohesion (0-1 scale), clamped */
      delta: number;
    }
  | { type: 'none' };

export interface EventCardChoice {
  id: string;
  label: string;
  effects: CardEffect[];
}

export interface EventCard {
  id: string;
  title: string;
  /** Narrative text; may contain {player} placeholders for involved players */
  text: string;
  /**
   * Fire condition: "chemistry-effect:<id>" limits the card to seasons where
   * that chemistry effect is currently active. Involved players become the
   * effect's producers (sorted by overall, best first).
   */
  requires?: string;
  choices: EventCardChoice[];
}

/**
 * A real NBA player as scraped from 2kratings.com (see scripts/fetch-nba-data.ts).
 * Raw source data, distinct from the in-game Player shape — the sim maps it via
 * toPlayer() in packages/sim, deriving salary/pWAR/traits deterministically.
 */
/** Per-game averages from the most recent NBA season (Basketball-Reference). */
export interface RealPlayerStats {
  /** e.g. "2025-26" */
  season: string;
  gamesPlayed: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  /** Field-goal percentage, 0-1 */
  fgPct: number;
  /** Three-point percentage, 0-1 */
  threePct: number;
}

/**
 * The 2K attribute sheet scraped from team-page rows (see
 * scripts/fetch-nba-data.ts). Optional on RealPlayerRecord: rows missing any
 * attribute fall back to the legacy overall/3PT/dunk trait heuristics.
 */
export interface PlayerAttributes {
  midRange: number;
  closeShot: number;
  layup: number;
  standingDunk: number;
  vertical: number;
  speed: number;
  ballHandle: number;
  passAccuracy: number;
  passVision: number;
  passIq: number;
  drawFoul: number;
  postControl: number;
  interiorDefense: number;
  perimeterDefense: number;
  steal: number;
  block: number;
  offensiveRebound: number;
  defensiveRebound: number;
  durability: number;
  intangibles: number;
}

export interface RealPlayerRecord {
  name: string;
  /** Primary position (first listed on 2kratings) */
  position: Position;
  /** Other listed positions for dual-position players */
  altPositions?: Position[];
  /** 2K overall rating */
  overall: number;
  /** 2K three-point rating, used to derive shooting traits and off/def lean */
  threePoint: number;
  /** 2K dunk rating, used to derive athletic traits and off/def lean */
  dunk: number;
  /** Full attribute sheet when the scrape captured it; enables deep traits */
  attributes?: PlayerAttributes;
  /** Absolute headshot URL scraped alongside the ratings, when the site has one */
  imageUrl?: string;
  /** Last season's per-game averages, when the stats source has the player */
  stats?: RealPlayerStats;
}

export interface RealTeamRecord {
  name: string;
  players: RealPlayerRecord[];
}

/** The bundled real-player dataset in data/nba-players.json. */
export interface NbaDataset {
  /** ISO date the data was scraped; a refresh changes what a seed produces */
  fetchedAt: string;
  source: string;
  teams: RealTeamRecord[];
}

/** Which historical listing an era team was scraped from. */
export type EraCategory = 'classic' | 'all-time';

/** A historical roster from 2kratings.com (classic season or all-time franchise team). */
export interface EraTeamRecord extends RealTeamRecord {
  category: EraCategory;
  /** Season label for classic teams (e.g. "1985-86"); "All-Time" otherwise */
  era: string;
  /** Scraped URL slug (e.g. "1985-86-chicago-bulls"), used for stable player ids */
  slug: string;
}

/** The bundled era dataset in data/nba-players-eras.json. */
export interface EraDataset {
  fetchedAt: string;
  source: string;
  teams: EraTeamRecord[];
}

/**
 * Which pool of real players a run draws from: the current season's rosters,
 * classic historical teams, all-time franchise teams, or all of them mixed.
 */
export type PoolMode = 'current' | 'classic' | 'all-time' | 'mixed';

/** The datasets a run's league and free agents are built from. */
export interface PlayerPool {
  mode: PoolMode;
  /** Required for 'current' and 'mixed' */
  nba?: NbaDataset;
  /** Required for 'classic', 'all-time', and 'mixed' */
  eras?: EraDataset;
}

/** Temporary player modifiers accumulated from events, ticked down per game. */
export interface ActiveEffects {
  /** playerId -> games still sidelined */
  injuries: Record<string, number>;
  /** playerId -> temporary overall modifier */
  ratingMods: Record<string, { delta: number; gamesRemaining: number }>;
}

export interface ScheduledGame {
  opponentTeamId: string;
  isHome: boolean;
}

/**
 * Team-roll draft (82-0 style): each of 15 rounds a random team is rolled
 * and the player picks any of its players. Position minimums (2 per
 * position) are enforced by a feasibility check instead of a fixed slot
 * order: a pick is blocked if it would leave too few remaining rounds to
 * cover the positions still short.
 */
export interface DraftState {
  /** Id of the team currently offering its roster */
  rolledTeamId: string;
  /** Total rolls made (picks + rerolls); indexes the seeded roll stream */
  rollIndex: number;
  rerollsLeft: number;
  roster: Player[];
}

/** A fired morale card waiting on the player's choice; blocks the next game. */
export interface PendingCard {
  cardId: string;
  playerIds: string[];
}

/** A rolled nagging injury waiting on the play-hurt/sit decision. */
export interface PendingNagging {
  playerId: string;
  playHurtDelta: number;
  playHurtGames: number;
  sitGames: number;
}

export interface SeasonState {
  /** Full 82-game schedule, in order */
  schedule: ScheduledGame[];
  /** Results for the games played so far (prefix of the schedule) */
  results: GameResult[];
  /** Events that have fired this season, in order */
  events: SeasonEvent[];
  /** Injuries and temporary rating modifiers currently active */
  effects: ActiveEffects;
  /** Dead cap accumulated from waived players, counts against the cap */
  deadCap: number;
  pendingCard: PendingCard | null;
  pendingNagging: PendingNagging | null;
  /**
   * How gelled the roster is, 0-1. Grows with games (wins faster), drops on
   * FA signings, jumps via card effects. Friction chemistry fades with it.
   */
  cohesion: number;
}

export interface RunState {
  seed: number;
  /** Difficulty level; 0 is the base game */
  ascension: number;
  /**
   * Casual mode: no salary cap at all — draft and sign anyone. Casual runs
   * count in career stats but earn no badges, unlock no ascensions, and
   * never post to the leaderboard.
   */
  casual: boolean;
  /** Losses left before the run ends (1 in classic perfect-season mode) */
  livesRemaining: number;
  /** The 29 CPU teams, generated from the seed */
  league: Team[];
  /** Non-null while status is 'drafting' */
  draft: DraftState | null;
  /** Final roster once the season starts */
  roster: Player[];
  /** Null while drafting, populated when the season starts */
  season: SeasonState | null;
  wins: number;
  losses: number;
  status: 'drafting' | 'in-season' | 'playoffs' | 'won' | 'lost';
}
