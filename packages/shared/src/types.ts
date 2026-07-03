export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface Player {
  id: string;
  name: string;
  position: Position;
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
      type: 'morale';
      /** Reference into the authored event-card pool in data/ */
      cardId: string;
      playerIds: string[];
    };

/** A chemistry synergy/anti-synergy derived from roster composition. */
export interface ChemistryEffect {
  id: string;
  label: string;
  /** Applied to team strength; positive = synergy, negative = anti-synergy */
  strengthDelta: number;
  /** Players producing the effect */
  playerIds: string[];
}

/**
 * Authored event-card content (locker-room scenarios with choices). Cards
 * live as static data in data/ — AI-generated at design time, validated
 * against this schema — and the engine references them by id.
 */
export type CardEffect =
  | {
      type: 'rating';
      /** Overall delta while active */
      delta: number;
      /** Games the effect lasts */
      games: number;
      /** Who it hits: the players named in the event, or the whole roster */
      target: 'involved' | 'team';
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
  choices: EventCardChoice[];
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

export interface DraftState {
  pool: Player[];
  roster: Player[];
}

/** A fired morale card waiting on the player's choice; blocks the next game. */
export interface PendingCard {
  cardId: string;
  playerIds: string[];
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
}

export interface RunState {
  seed: number;
  /** Difficulty level; 0 is the base game */
  ascension: number;
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
