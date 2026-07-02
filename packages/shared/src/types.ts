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

export interface RunState {
  seed: number;
  roster: Player[];
  gamesPlayed: number;
  wins: number;
  losses: number;
  /** Ended runs are either completed (82-0 + title) or busted (a loss) */
  status: 'drafting' | 'in-season' | 'playoffs' | 'won' | 'lost';
}
