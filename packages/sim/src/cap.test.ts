import { describe, expect, it } from 'vitest';
import { createRng, SALARY_CAP, type Player } from '@perfect-season/shared';
import { capSpace, totalSalary, validateRoster } from './cap';
import { generateRoster } from './league';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Test Player',
    position: 'SF',
    overall: 75,
    offense: 75,
    defense: 75,
    salary: 10,
    pWAR: 3,
    traits: [],
    ...overrides,
  };
}

describe('cap math', () => {
  it('sums salaries and subtracts from the cap', () => {
    const players = [makePlayer({ salary: 30 }), makePlayer({ salary: 20 })];
    expect(totalSalary(players)).toBe(50);
    expect(capSpace(players)).toBe(SALARY_CAP - 50);
  });

  it('dead cap reduces available space', () => {
    const players = [makePlayer({ salary: 30 })];
    expect(capSpace(players, 10)).toBe(SALARY_CAP - 40);
  });
});

describe('validateRoster', () => {
  it('accepts a generated 15-man roster', () => {
    // generateRoster gives 3 per position; cap default band keeps salaries low enough
    const roster = generateRoster(createRng(1), { minOverall: 55, maxOverall: 75 });
    const result = validateRoster(roster);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects wrong roster size', () => {
    const result = validateRoster([makePlayer()]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exactly 15'))).toBe(true);
  });

  it('rejects missing position coverage', () => {
    const roster = Array.from({ length: 15 }, () => makePlayer({ position: 'C', salary: 2 }));
    const result = validateRoster(roster);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('PG'))).toBe(true);
  });

  it('rejects a roster over the cap', () => {
    const roster = generateRoster(createRng(2), { minOverall: 55, maxOverall: 75 }).map((p) => ({
      ...p,
      salary: 20,
    }));
    const result = validateRoster(roster);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Over the salary cap'))).toBe(true);
  });

  it('rejects duplicate players', () => {
    const base = generateRoster(createRng(3), { minOverall: 55, maxOverall: 70 });
    const roster = [...base.slice(0, 14), base[0]];
    const result = validateRoster(roster);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
  });
});
