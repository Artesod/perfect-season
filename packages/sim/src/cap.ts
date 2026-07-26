import {
  MIN_PER_POSITION,
  POSITIONS,
  ROSTER_SIZE,
  SALARY_CAP,
  type Player,
} from '@perfect-season/shared';

/**
 * Salary cap math and roster legality. Dead cap (from waived players) counts
 * against the cap but isn't attached to any rostered player, so it's passed
 * alongside the roster where relevant.
 */

export function totalSalary(players: readonly Player[]): number {
  return players.reduce((sum, p) => sum + p.salary, 0);
}

export function capSpace(players: readonly Player[], deadCap = 0): number {
  return SALARY_CAP - totalSalary(players) - deadCap;
}

export interface RosterValidation {
  valid: boolean;
  errors: string[];
}

/** Full legality check for starting (or continuing) a season. */
export function validateRoster(players: readonly Player[], deadCap = 0): RosterValidation {
  const errors: string[] = [];

  if (players.length !== ROSTER_SIZE) {
    errors.push(`Roster must have exactly ${ROSTER_SIZE} players (has ${players.length})`);
  }

  for (const position of POSITIONS) {
    const count = players.filter((p) => p.position === position).length;
    if (count < MIN_PER_POSITION) {
      errors.push(`Need at least ${MIN_PER_POSITION} ${position}s (has ${count})`);
    }
  }

  const space = capSpace(players, deadCap);
  if (space < 0) {
    errors.push(`Over the salary cap by $${Math.abs(space).toFixed(1)}M`);
  }

  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) {
    errors.push('Roster contains duplicate players');
  }

  // Era pools offer the same person as several versions ('91 vs '96 Jordan);
  // only one version of a person may be rostered.
  const byPerson = new Map<string, Player>();
  for (const player of players) {
    if (!player.personKey) continue;
    const other = byPerson.get(player.personKey);
    if (other && other.id !== player.id) {
      errors.push(`${player.name} and ${other.name} are versions of the same player`);
    }
    byPerson.set(player.personKey, player);
  }

  return { valid: errors.length === 0, errors };
}
