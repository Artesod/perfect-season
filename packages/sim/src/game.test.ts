import { describe, expect, it } from 'vitest';
import { createRng, type Player, type Team } from '@perfect-season/shared';
import { homeWinProbability, simulateGame, teamStrength } from './game';

function makeTeam(id: string, overall: number): Team {
  const players: Player[] = Array.from({ length: 15 }, (_, i) => ({
    id: `${id}-p${i}`,
    name: `Player ${i}`,
    position: 'SF',
    overall,
    offense: overall,
    defense: overall,
    salary: 10,
    pWAR: 2,
    traits: [],
  }));
  return { id, name: id, players };
}

describe('teamStrength', () => {
  it('equals player overall for a uniform roster', () => {
    expect(teamStrength(makeTeam('a', 80))).toBeCloseTo(80);
  });
});

describe('homeWinProbability', () => {
  it('favors the stronger team', () => {
    const strong = makeTeam('strong', 90);
    const weak = makeTeam('weak', 70);
    expect(homeWinProbability(strong, weak)).toBeGreaterThan(0.9);
    expect(homeWinProbability(weak, strong)).toBeLessThan(0.1);
  });

  it('gives the home team an edge between equal teams', () => {
    const a = makeTeam('a', 80);
    const b = makeTeam('b', 80);
    const p = homeWinProbability(a, b);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.6);
  });
});

describe('simulateGame', () => {
  it('is deterministic for the same seed', () => {
    const home = makeTeam('home', 85);
    const away = makeTeam('away', 82);
    const a = simulateGame(home, away, createRng(42));
    const b = simulateGame(home, away, createRng(42));
    expect(a).toEqual(b);
  });

  it('produces a valid score and winner', () => {
    const home = makeTeam('home', 85);
    const away = makeTeam('away', 82);
    const rng = createRng(7);
    for (let i = 0; i < 100; i++) {
      const result = simulateGame(home, away, rng);
      expect(result.homeScore).not.toBe(result.awayScore);
      const winner = result.homeScore > result.awayScore ? home.id : away.id;
      expect(result.winnerTeamId).toBe(winner);
    }
  });

  it('upsets happen but are rare for a much stronger home team', () => {
    const strong = makeTeam('strong', 92);
    const weak = makeTeam('weak', 75);
    const rng = createRng(123);
    let losses = 0;
    for (let i = 0; i < 1000; i++) {
      const result = simulateGame(strong, weak, rng);
      if (result.winnerTeamId !== strong.id) losses++;
    }
    expect(losses).toBeGreaterThan(0);
    expect(losses).toBeLessThan(150);
  });
});
