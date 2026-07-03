import type { Position } from './types';

export const POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** League salary cap in millions. Tight enough that 3 max players is infeasible. */
export const SALARY_CAP = 155;

/** Exact roster size required to start the season */
export const ROSTER_SIZE = 15;

/** Minimum players required at each position */
export const MIN_PER_POSITION = 2;

/** League minimum annual salary in millions */
export const MIN_SALARY = 2;
