import { describe, expect, it } from 'vitest';
import { createRng, ROSTER_SIZE, SALARY_CAP } from '@perfect-season/shared';
import { totalSalary } from './cap';
import { canSign, generateFreeAgents, signPlayer, waivePlayer } from './freeAgency';
import { generatePlayer, generateRoster } from './league';

describe('generateFreeAgents', () => {
  it('is deterministic and respects the quality ceiling', () => {
    expect(generateFreeAgents(createRng(1))).toEqual(generateFreeAgents(createRng(1)));
    const pool = generateFreeAgents(createRng(2), { count: 50 });
    expect(pool).toHaveLength(50);
    for (const p of pool) {
      expect(p.overall).toBeLessThanOrEqual(82);
    }
  });
});

describe('sign and waive', () => {
  it('signs a player when there is room and cap space', () => {
    const roster = generateRoster(createRng(3), { minOverall: 55, maxOverall: 70 }).slice(0, 14);
    const target = generatePlayer(createRng(4), { minOverall: 60, maxOverall: 70 });
    const signed = signPlayer(roster, target);
    expect(signed).toHaveLength(15);
    expect(signed).toContainEqual(target);
  });

  it('blocks signing onto a full roster', () => {
    const roster = generateRoster(createRng(5), { minOverall: 55, maxOverall: 70 });
    expect(roster).toHaveLength(ROSTER_SIZE);
    const target = generatePlayer(createRng(6));
    const check = canSign(roster, target);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('roster-full');
  });

  it('blocks signing a player the cap cannot absorb', () => {
    const roster = generateRoster(createRng(7), { minOverall: 55, maxOverall: 70 }).slice(0, 14);
    const star = generatePlayer(createRng(8), { minOverall: 95, maxOverall: 95 });
    const deadCap = SALARY_CAP - totalSalary(roster) - star.salary + 1; // 1M short
    const check = canSign(roster, star, deadCap);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('cannot-afford');
    expect(() => signPlayer(roster, star, deadCap)).toThrow();
  });

  it('waiving removes the player and incurs dead cap', () => {
    const roster = generateRoster(createRng(9), { minOverall: 70, maxOverall: 80 });
    const victim = roster[0];
    const { roster: after, deadCapIncurred } = waivePlayer(roster, victim.id);
    expect(after).toHaveLength(ROSTER_SIZE - 1);
    expect(after.find((p) => p.id === victim.id)).toBeUndefined();
    expect(deadCapIncurred).toBeCloseTo(victim.salary * 0.5, 1);
  });

  it('throws when waiving a player not on the roster', () => {
    const roster = generateRoster(createRng(9), { minOverall: 70, maxOverall: 80 });
    expect(() => waivePlayer(roster, 'ghost')).toThrow();
  });
});
