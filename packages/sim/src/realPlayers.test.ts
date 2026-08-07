import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createRng,
  MIN_SALARY,
  ROSTER_SIZE,
  type DraftState,
  type PlayerPool,
  type RunState,
  type Team,
} from '@perfect-season/shared';
import { FIXTURE_DATASET, FIXTURE_ERA_DATASET } from './__fixtures__/nbaDataset';
import { validateRoster } from './cap';
import { MAX_ASCENSION } from './difficulty';
import { canPickPlayer, draftCandidates } from './draft';
import { canSign } from './freeAgency';
import {
  buildRealLeague,
  isValidEraDataset,
  isValidNbaDataset,
  mapPoolPlayers,
  REAL_FA_EXCLUDED_TOP_FRACTION,
  sampleRealFreeAgents,
} from './realPlayers';
import {
  createRun,
  currentFreeAgents,
  playNextGame,
  runCanPick,
  runPickPlayer,
  runRerollTeam,
  startSeason,
} from './run';

const REAL_DATASET = JSON.parse(
  readFileSync(join(__dirname, '../../../data/nba-players.json'), 'utf-8'),
);

const REAL_ERA_DATASET = JSON.parse(
  readFileSync(join(__dirname, '../../../data/nba-players-eras.json'), 'utf-8'),
);

const CLASSIC_POOL: PlayerPool = { mode: 'classic', eras: FIXTURE_ERA_DATASET };
const ALL_TIME_POOL: PlayerPool = { mode: 'all-time', eras: FIXTURE_ERA_DATASET };
const MIXED_POOL: PlayerPool = { mode: 'mixed', nba: FIXTURE_DATASET, eras: FIXTURE_ERA_DATASET };

/** Best legal pick each round, rerolling rounds with no legal candidate. */
function draftLegalRoster(run: RunState): RunState {
  let guard = 0;
  while (run.draft!.roster.length < ROSTER_SIZE && guard++ < 200) {
    const legal = draftCandidates(run.draft!, run.league)
      .filter((p) => runCanPick(run, p.id).ok)
      .sort((a, b) => b.overall - a.overall);
    if (legal.length === 0) {
      run = runRerollTeam(run);
      continue;
    }
    run = runPickPlayer(run, legal[0].id);
  }
  return run;
}

/** Two mapped versions of the same person from different era teams. */
function samePersonPair(pool: PlayerPool) {
  const byPerson = new Map<string, ReturnType<typeof mapPoolPlayers>>();
  for (const entry of mapPoolPlayers(pool)) {
    const list = byPerson.get(entry.player.personKey!) ?? [];
    list.push(entry);
    byPerson.set(entry.player.personKey!, list);
  }
  const versions = [...byPerson.values()].find((list) => list.length >= 2);
  expect(versions).toBeDefined();
  return [versions![0], versions![1]] as const;
}

describe('mapPoolPlayers', () => {
  it('maps every record with unique stable ids and derived fields', () => {
    const mapped = mapPoolPlayers(FIXTURE_DATASET);
    const totalRecords = FIXTURE_DATASET.teams.reduce((s, t) => s + t.players.length, 0);
    expect(mapped).toHaveLength(totalRecords);

    const ids = new Set(mapped.map((m) => m.player.id));
    expect(ids.size).toBe(mapped.length);

    for (const { player } of mapped) {
      expect(player.id).toMatch(/^nba-/);
      expect(player.salary).toBeGreaterThanOrEqual(2);
      expect(player.pWAR).toBeGreaterThanOrEqual(0);
      expect(player.traits.length).toBeGreaterThanOrEqual(1);
      expect(player.traits.length).toBeLessThanOrEqual(2);
      expect(player.offense).toBeGreaterThanOrEqual(40);
      expect(player.defense).toBeGreaterThanOrEqual(40);
      expect(player.personKey).toBeTruthy();
      expect(player.eraTeam).toBeUndefined();
    }
  });

  it('is pure: two calls produce identical output', () => {
    expect(mapPoolPlayers(FIXTURE_DATASET)).toEqual(mapPoolPlayers(FIXTURE_DATASET));
  });

  it('carries headshot URLs through and leaves them unset otherwise', () => {
    const mapped = mapPoolPlayers(FIXTURE_DATASET);
    const withImage = mapped.filter((m) => m.player.imageUrl !== undefined);
    expect(withImage.length).toBeGreaterThan(0);
    expect(withImage.length).toBeLessThan(mapped.length);
    for (const { player } of withImage) {
      expect(player.imageUrl).toMatch(/^https:\/\//);
    }
  });

  it('carries per-game stats through and leaves them unset otherwise', () => {
    const mapped = mapPoolPlayers(FIXTURE_DATASET);
    const withStats = mapped.filter((m) => m.player.stats !== undefined);
    expect(withStats.length).toBeGreaterThan(0);
    expect(withStats.length).toBeLessThan(mapped.length);
    for (const { player } of withStats) {
      expect(player.stats!.points).toBeGreaterThanOrEqual(0);
      expect(player.stats!.season).toBe('2025-26');
    }
  });

  it('keeps depth players at minimum salary so a 15-man roster stays affordable', () => {
    // The 2K distribution is compressed — era pools even more so — so
    // salaries come from pool-wide rank, not raw overall (see
    // salaryOverallForRank). Every pool must produce a healthy
    // minimum-salary bracket, or a legal 15-man roster becomes impossible.
    const pools: (PlayerPool | typeof FIXTURE_DATASET)[] = [
      FIXTURE_DATASET,
      REAL_DATASET,
      CLASSIC_POOL,
      ALL_TIME_POOL,
      MIXED_POOL,
      { mode: 'classic', eras: REAL_ERA_DATASET },
      { mode: 'all-time', eras: REAL_ERA_DATASET },
      { mode: 'mixed', nba: REAL_DATASET, eras: REAL_ERA_DATASET },
    ];
    for (const pool of pools) {
      const mapped = mapPoolPlayers(pool);
      const minSalaryShare =
        mapped.filter((m) => m.player.salary === MIN_SALARY).length / mapped.length;
      expect(minSalaryShare).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe('era pools', () => {
  it('classic pools era-tag ids, names, and teams', () => {
    const mapped = mapPoolPlayers(CLASSIC_POOL);
    const total = FIXTURE_ERA_DATASET.teams
      .filter((t) => t.category === 'classic')
      .reduce((s, t) => s + t.players.length, 0);
    expect(mapped).toHaveLength(total);
    expect(new Set(mapped.map((m) => m.player.id)).size).toBe(mapped.length);

    for (const { player } of mapped) {
      expect(player.id).toMatch(/^era-/);
      expect(player.name).toMatch(/ '\d\d$/);
      expect(player.eraTeam).toBeTruthy();
      expect(player.personKey).toBeTruthy();
    }
  });

  it('all-time pools mark players as All-Time versions', () => {
    const mapped = mapPoolPlayers(ALL_TIME_POOL);
    expect(mapped.length).toBeGreaterThan(0);
    for (const { player } of mapped) {
      expect(player.name).toMatch(/ \(All-Time\)$/);
      expect(player.eraTeam).toMatch(/^All-Time/);
    }
  });

  it('mixed pools combine current rosters with both era categories', () => {
    const mapped = mapPoolPlayers(MIXED_POOL);
    const expected =
      mapPoolPlayers(FIXTURE_DATASET).length +
      mapPoolPlayers(CLASSIC_POOL).length +
      mapPoolPlayers(ALL_TIME_POOL).length;
    expect(mapped).toHaveLength(expected);
    expect(new Set(mapped.map((m) => m.player.id)).size).toBe(mapped.length);
    expect(mapped.some((m) => m.player.id.startsWith('nba-'))).toBe(true);
    expect(mapped.some((m) => m.player.id.startsWith('era-'))).toBe(true);
  });

  it('era versions of one person share a personKey but stay distinct players', () => {
    const [a, b] = samePersonPair(CLASSIC_POOL);
    expect(a.player.id).not.toBe(b.player.id);
    expect(a.player.name).not.toBe(b.player.name);
    expect(a.player.personKey).toBe(b.player.personKey);
  });
});

describe('duplicate era versions of one person', () => {
  it('validateRoster rejects a roster holding two versions', () => {
    const [a, b] = samePersonPair(CLASSIC_POOL);
    const filler = mapPoolPlayers(CLASSIC_POOL)
      .filter((m) => m.player.personKey !== a.player.personKey)
      .slice(0, 13)
      .map((m) => m.player);
    const result = validateRoster([a.player, b.player, ...filler]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('versions of the same player'))).toBe(true);
  });

  it('canPickPlayer blocks drafting a second version', () => {
    const league = buildRealLeague(CLASSIC_POOL, createRng(11));
    const byPerson = new Map<string, { team: Team; player: (typeof league)[0]['players'][0] }[]>();
    for (const team of league) {
      for (const player of team.players) {
        const list = byPerson.get(player.personKey!) ?? [];
        list.push({ team, player });
        byPerson.set(player.personKey!, list);
      }
    }
    const versions = [...byPerson.values()].find((list) => list.length >= 2)!;
    const [a, b] = versions;

    const state: DraftState = {
      rolledTeamId: b.team.id,
      rollIndex: 1,
      rerollsLeft: 2,
      roster: [a.player],
    };
    const check = canPickPlayer(state, league, b.player.id);
    expect(check).toMatchObject({ ok: false, reason: 'duplicate-person' });
  });

  it('canSign blocks signing a second version', () => {
    const [a, b] = samePersonPair(CLASSIC_POOL);
    const check = canSign([a.player], b.player);
    expect(check).toMatchObject({ ok: false, reason: 'duplicate-person' });
  });
});

describe('buildRealLeague', () => {
  it('builds 29 CPU teams with full real rosters and unique players', () => {
    const league = buildRealLeague(FIXTURE_DATASET, createRng(42));
    expect(league).toHaveLength(29);

    const cpuIds = league.flatMap((t) => t.players.map((p) => p.id));
    expect(new Set(cpuIds).size).toBe(cpuIds.length);
    for (const team of league) {
      expect(team.players.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('builds one CPU team per era roster, minus the one the user replaces', () => {
    expect(buildRealLeague(CLASSIC_POOL, createRng(1))).toHaveLength(59);
    expect(buildRealLeague(ALL_TIME_POOL, createRng(1))).toHaveLength(24);
    expect(buildRealLeague(MIXED_POOL, createRng(1))).toHaveLength(30 + 85 - 1);
  });

  it('is deterministic for the same rng seed', () => {
    expect(buildRealLeague(FIXTURE_DATASET, createRng(99))).toEqual(
      buildRealLeague(FIXTURE_DATASET, createRng(99)),
    );
    expect(buildRealLeague(MIXED_POOL, createRng(99))).toEqual(
      buildRealLeague(MIXED_POOL, createRng(99)),
    );
  });

  it('applies the CPU overall bonus', () => {
    const base = buildRealLeague(FIXTURE_DATASET, createRng(5), 0);
    const hard = buildRealLeague(FIXTURE_DATASET, createRng(5), 5);
    const avg = (teams: Team[]) =>
      teams.flatMap((t) => t.players).reduce((s, p) => s + p.overall, 0) /
      teams.flatMap((t) => t.players).length;
    expect(avg(hard)).toBeGreaterThan(avg(base));
  });
});

describe('sampleRealFreeAgents', () => {
  it('excludes rostered players and the top of the pool', () => {
    const mapped = mapPoolPlayers(FIXTURE_DATASET);
    const exclude = new Set(mapped.slice(0, 100).map((m) => m.player.id));
    const agents = sampleRealFreeAgents(FIXTURE_DATASET, createRng(3), exclude);
    expect(agents).toHaveLength(10);

    const minRank = Math.round(mapped.length * REAL_FA_EXCLUDED_TOP_FRACTION);
    const rankById = new Map(mapped.map((m) => [m.player.id, m.rank]));
    for (const agent of agents) {
      expect(exclude.has(agent.id)).toBe(false);
      expect(rankById.get(agent.id)!).toBeGreaterThanOrEqual(minRank);
    }
  });

  it('keeps era superstars off the market too', () => {
    const mapped = mapPoolPlayers(ALL_TIME_POOL);
    const agents = sampleRealFreeAgents(ALL_TIME_POOL, createRng(3), new Set());
    const minRank = Math.round(mapped.length * REAL_FA_EXCLUDED_TOP_FRACTION);
    const rankById = new Map(mapped.map((m) => [m.player.id, m.rank]));
    expect(agents.every((a) => rankById.get(a.id)! >= minRank)).toBe(true);
  });

  it('falls back to procedural players when the pot runs dry', () => {
    const everyone = new Set(mapPoolPlayers(FIXTURE_DATASET).map((m) => m.player.id));
    const agents = sampleRealFreeAgents(FIXTURE_DATASET, createRng(3), everyone);
    expect(agents).toHaveLength(10);
    expect(agents.every((a) => a.id.startsWith('gen-'))).toBe(true);
  });
});

describe('dataset validation', () => {
  it('accepts the fixtures and the shipped datasets', () => {
    expect(isValidNbaDataset(FIXTURE_DATASET)).toBe(true);
    expect(isValidNbaDataset(REAL_DATASET)).toBe(true);
    expect(isValidEraDataset(FIXTURE_ERA_DATASET)).toBe(true);
    expect(isValidEraDataset(REAL_ERA_DATASET)).toBe(true);
  });

  it('rejects malformed data', () => {
    expect(isValidNbaDataset(null)).toBe(false);
    expect(isValidNbaDataset({})).toBe(false);
    expect(isValidNbaDataset({ fetchedAt: 'x', teams: [] })).toBe(false);
    expect(isValidEraDataset(null)).toBe(false);
    expect(isValidEraDataset(FIXTURE_DATASET)).toBe(false);
    expect(
      isValidEraDataset({
        ...FIXTURE_ERA_DATASET,
        teams: FIXTURE_ERA_DATASET.teams.filter((t) => t.category === 'classic'),
      }),
    ).toBe(false);
  });
});

describe('createRun with a real dataset', () => {
  it('is deterministic and plays through a season', () => {
    const a = createRun(1234, 0, FIXTURE_DATASET);
    const b = createRun(1234, 0, FIXTURE_DATASET);
    expect(a).toEqual(b);
    expect(a.league).toHaveLength(29);
    expect(a.league.some((t) => t.id === a.draft!.rolledTeamId)).toBe(true);

    let run = startSeason(draftLegalRoster(a));
    expect(run.status).toBe('in-season');
    expect(run.roster).toHaveLength(ROSTER_SIZE);
    let guard = 0;
    while (run.status === 'in-season' && guard++ < 100) {
      run = playNextGame(run);
    }
    expect(['won', 'lost']).toContain(run.status);
  });

  it('completes a legal draft across several seeds', () => {
    for (const seed of [7, 21, 88, 4321]) {
      const run = draftLegalRoster(createRun(seed, 0, FIXTURE_DATASET));
      expect(run.draft!.roster).toHaveLength(ROSTER_SIZE);
    }
  });

  it('draws real free agents when given the dataset', () => {
    const run = startSeason(draftLegalRoster(createRun(77, 0, FIXTURE_DATASET)));
    const agents = currentFreeAgents(run, FIXTURE_DATASET);
    expect(agents).toHaveLength(10);
    expect(agents.some((a) => a.id.startsWith('nba-'))).toBe(true);

    const rosteredIds = new Set(
      [...run.roster, ...run.league.flatMap((t) => t.players)].map((p) => p.id),
    );
    expect(agents.every((a) => !rosteredIds.has(a.id))).toBe(true);
  });

  it('higher ascension strengthens real CPU teams too', () => {
    const base = createRun(7, 0, FIXTURE_DATASET);
    const hard = createRun(7, MAX_ASCENSION, FIXTURE_DATASET);
    const avg = (run: RunState) =>
      run.league.flatMap((t) => t.players).reduce((s, p) => s + p.overall, 0) /
      run.league.flatMap((t) => t.players).length;
    expect(avg(hard)).toBeGreaterThan(avg(base));
  });
});

describe('createRun with era pools', () => {
  it('completes a legal draft in every era mode across seeds', () => {
    for (const pool of [CLASSIC_POOL, ALL_TIME_POOL, MIXED_POOL]) {
      for (const seed of [7, 88, 4321]) {
        const run = draftLegalRoster(createRun(seed, 0, pool));
        expect(run.draft!.roster).toHaveLength(ROSTER_SIZE);
        expect(validateRoster(run.draft!.roster).valid).toBe(true);
      }
    }
  });

  it('drafted era rosters never hold two versions of one person', () => {
    const run = draftLegalRoster(createRun(42, 0, MIXED_POOL));
    const keys = run.draft!.roster.map((p) => p.personKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('plays a mixed-pool run through to a terminal state deterministically', () => {
    expect(createRun(555, 0, MIXED_POOL)).toEqual(createRun(555, 0, MIXED_POOL));
    let run = startSeason(draftLegalRoster(createRun(555, 0, MIXED_POOL)));
    let guard = 0;
    while (run.status === 'in-season' && guard++ < 100) {
      run = playNextGame(run);
    }
    expect(['won', 'lost']).toContain(run.status);
  });

  it('drafted players leave short era rosters too (top-up must not mask removal)', () => {
    // Era teams run as short as 7-13 players, so removing a pick and topping
    // the roster back up can land on the original length — the removal must
    // still stick.
    for (const seed of [7, 42, 555]) {
      const run = startSeason(draftLegalRoster(createRun(seed, 0, CLASSIC_POOL)));
      const draftedIds = new Set(run.roster.map((p) => p.id));
      const stillRostered = run.league.flatMap((t) => t.players).filter((p) => draftedIds.has(p.id));
      expect(stillRostered).toEqual([]);
      for (const team of run.league) {
        expect(team.players.length).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('draws era free agents from the same pool', () => {
    const run = startSeason(draftLegalRoster(createRun(77, 0, CLASSIC_POOL)));
    const agents = currentFreeAgents(run, CLASSIC_POOL);
    expect(agents).toHaveLength(10);
    expect(agents.some((a) => a.id.startsWith('era-'))).toBe(true);
  });
});

describe('era pool balance', () => {
  it('the shipped era pools support a legal draft at the hardest cap squeeze', () => {
    const pools: PlayerPool[] = [
      { mode: 'classic', eras: REAL_ERA_DATASET },
      { mode: 'all-time', eras: REAL_ERA_DATASET },
      { mode: 'mixed', nba: REAL_DATASET, eras: REAL_ERA_DATASET },
    ];
    for (const pool of pools) {
      for (const seed of [3, 1717]) {
        const run = draftLegalRoster(createRun(seed, MAX_ASCENSION, pool));
        expect(run.draft!.roster).toHaveLength(ROSTER_SIZE);
      }
    }
  });

  it('era supermax players cost real money: top salaries match current pools', () => {
    for (const pool of [
      { mode: 'classic' as const, eras: REAL_ERA_DATASET },
      { mode: 'all-time' as const, eras: REAL_ERA_DATASET },
    ]) {
      const salaries = mapPoolPlayers(pool)
        .map((m) => m.player.salary)
        .sort((a, b) => b - a);
      expect(salaries[0]).toBeGreaterThanOrEqual(45); // supermax tier exists
    }
  });
});
