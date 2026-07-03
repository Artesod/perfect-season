import { describe, expect, it } from 'vitest';
import { createRng } from '@perfect-season/shared';
import {
  generateLeague,
  generatePlayer,
  generateRoster,
  pWarForOverall,
  salaryForOverall,
} from './league';

describe('generatePlayer', () => {
  it('is deterministic for the same seed', () => {
    const a = generatePlayer(createRng(42));
    const b = generatePlayer(createRng(42));
    expect(a).toEqual(b);
  });

  it('respects the requested overall range and position', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const p = generatePlayer(rng, { position: 'C', minOverall: 70, maxOverall: 80 });
      expect(p.position).toBe('C');
      expect(p.overall).toBeGreaterThanOrEqual(70);
      expect(p.overall).toBeLessThanOrEqual(80);
      expect(p.offense).toBeGreaterThanOrEqual(40);
      expect(p.defense).toBeGreaterThanOrEqual(40);
      expect(p.traits.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('generates unique ids across a large batch', () => {
    const rng = createRng(99);
    const ids = new Set(Array.from({ length: 2000 }, () => generatePlayer(rng).id));
    expect(ids.size).toBe(2000);
  });
});

describe('salary and pWAR curves', () => {
  it('pays superstars more than role players', () => {
    expect(salaryForOverall(95)).toBeGreaterThan(salaryForOverall(80));
    expect(salaryForOverall(80)).toBeGreaterThan(salaryForOverall(65));
  });

  it('gives replacement-level players zero pWAR', () => {
    expect(pWarForOverall(60)).toBe(0);
    expect(pWarForOverall(90)).toBeGreaterThan(5);
  });
});

describe('generateRoster', () => {
  it('produces 15 players with 3 per position', () => {
    const roster = generateRoster(createRng(1));
    expect(roster).toHaveLength(15);
    for (const position of ['PG', 'SG', 'SF', 'PF', 'C']) {
      expect(roster.filter((p) => p.position === position)).toHaveLength(3);
    }
  });
});

describe('generateLeague', () => {
  it('produces 29 CPU teams by default, each with a full roster', () => {
    const league = generateLeague(createRng(5));
    expect(league).toHaveLength(29);
    for (const team of league) {
      expect(team.players).toHaveLength(15);
    }
    expect(new Set(league.map((t) => t.id)).size).toBe(29);
  });

  it('is deterministic for the same seed', () => {
    expect(generateLeague(createRng(11))).toEqual(generateLeague(createRng(11)));
  });
});
