import { describe, expect, it } from 'vitest';
import { createRng, type Team } from '@perfect-season/shared';
import { generateLeague, generateRoster } from './league';
import { generateSchedule, SEASON_LENGTH, simulateSeason } from './season';

function makeUserTeam(rng = createRng(1000), min = 85, max = 95): Team {
  return {
    id: 'user',
    name: 'User Team',
    players: generateRoster(rng, { minOverall: min, maxOverall: max }),
  };
}

describe('generateSchedule', () => {
  it('produces exactly 82 games covering every opponent home and away', () => {
    const league = generateLeague(createRng(2));
    const schedule = generateSchedule(
      createRng(3),
      league.map((t) => t.id),
    );

    expect(schedule).toHaveLength(SEASON_LENGTH);
    for (const team of league) {
      const vs = schedule.filter((g) => g.opponentTeamId === team.id);
      expect(vs.length).toBeGreaterThanOrEqual(2);
      expect(vs.some((g) => g.isHome)).toBe(true);
      expect(vs.some((g) => !g.isHome)).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    const ids = generateLeague(createRng(2)).map((t) => t.id);
    expect(generateSchedule(createRng(4), ids)).toEqual(generateSchedule(createRng(4), ids));
  });

  it('throws with no opponents', () => {
    expect(() => generateSchedule(createRng(1), [])).toThrow();
  });
});

describe('simulateSeason', () => {
  it('stops at the first loss in perfect-season mode', () => {
    const league = generateLeague(createRng(20));
    const user = makeUserTeam(createRng(21), 60, 70); // weak team, will lose early
    const schedule = generateSchedule(
      createRng(22),
      league.map((t) => t.id),
    );

    const outcome = simulateSeason(user, league, schedule, createRng(23));
    expect(outcome.losses).toBe(1);
    expect(outcome.results).toHaveLength(outcome.wins + 1);
    expect(outcome.results.length).toBeLessThan(SEASON_LENGTH);
  });

  it('plays all 82 games when stopOnLoss is false', () => {
    const league = generateLeague(createRng(30));
    const user = makeUserTeam(createRng(31));
    const schedule = generateSchedule(
      createRng(32),
      league.map((t) => t.id),
    );

    const outcome = simulateSeason(user, league, schedule, createRng(33), { stopOnLoss: false });
    expect(outcome.results).toHaveLength(SEASON_LENGTH);
    expect(outcome.wins + outcome.losses).toBe(SEASON_LENGTH);
  });

  it('a stacked roster wins far more than it loses', () => {
    const league = generateLeague(createRng(40));
    const user = makeUserTeam(createRng(41), 92, 99);
    const schedule = generateSchedule(
      createRng(42),
      league.map((t) => t.id),
    );

    const outcome = simulateSeason(user, league, schedule, createRng(43), { stopOnLoss: false });
    expect(outcome.wins).toBeGreaterThan(60);
  });

  it('is deterministic for the same seed', () => {
    const league = generateLeague(createRng(50));
    const user = makeUserTeam(createRng(51));
    const schedule = generateSchedule(
      createRng(52),
      league.map((t) => t.id),
    );

    const a = simulateSeason(user, league, schedule, createRng(53), { stopOnLoss: false });
    const b = simulateSeason(user, league, schedule, createRng(53), { stopOnLoss: false });
    expect(a).toEqual(b);
  });
});
