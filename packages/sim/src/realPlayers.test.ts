import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createRng,
  MIN_PER_POSITION,
  POSITIONS,
  ROSTER_SIZE,
  type RunState,
} from '@perfect-season/shared';
import { FIXTURE_DATASET } from './__fixtures__/nbaDataset';
import { MAX_ASCENSION } from './difficulty';
import {
  buildRealLeague,
  isValidNbaDataset,
  mapDatasetPlayers,
  REAL_FA_MAX_OVERALL,
  sampleRealFreeAgents,
} from './realPlayers';
import { createRun, currentFreeAgents, playNextGame, runDraftPlayer, startSeason } from './run';

const REAL_DATASET = JSON.parse(
  readFileSync(join(__dirname, '../../../data/nba-players.json'), 'utf-8'),
);

function draftLegalRoster(run: RunState): RunState {
  for (const position of POSITIONS) {
    const options = run
      .draft!.pool.filter((p) => p.position === position)
      .sort((a, b) => a.salary - b.salary)
      .slice(0, MIN_PER_POSITION);
    for (const player of options) {
      run = runDraftPlayer(run, player.id);
    }
  }
  while (run.draft!.roster.length < ROSTER_SIZE) {
    const affordable = [...run.draft!.pool]
      .sort((a, b) => b.overall - a.overall)
      .find((p) => {
        try {
          runDraftPlayer(run, p.id);
          return true;
        } catch {
          return false;
        }
      });
    run = runDraftPlayer(run, affordable!.id);
  }
  return run;
}

describe('mapDatasetPlayers', () => {
  it('maps every record with unique stable ids and derived fields', () => {
    const mapped = mapDatasetPlayers(FIXTURE_DATASET);
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
    }
  });

  it('is pure: two calls produce identical output', () => {
    expect(mapDatasetPlayers(FIXTURE_DATASET)).toEqual(mapDatasetPlayers(FIXTURE_DATASET));
  });
});

describe('buildRealLeague', () => {
  it('builds a 72-player pool and 29 CPU teams with no player in both', () => {
    const setup = buildRealLeague(FIXTURE_DATASET, createRng(42));
    expect(setup.draftPool).toHaveLength(72);
    expect(setup.league).toHaveLength(29);

    const poolIds = new Set(setup.draftPool.map((p) => p.id));
    const cpuIds = setup.league.flatMap((t) => t.players.map((p) => p.id));
    expect(cpuIds.some((id) => poolIds.has(id))).toBe(false);
    expect(new Set(cpuIds).size).toBe(cpuIds.length);
  });

  it('keeps CPU rosters at rotation depth', () => {
    const setup = buildRealLeague(FIXTURE_DATASET, createRng(7));
    for (const team of setup.league) {
      expect(team.players.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('caps superstar scarcity to the top rank band', () => {
    const setup = buildRealLeague(FIXTURE_DATASET, createRng(11));
    const top12 = new Set(
      mapDatasetPlayers(FIXTURE_DATASET)
        .sort((a, b) => b.player.overall - a.player.overall || a.player.id.localeCompare(b.player.id))
        .slice(0, 12)
        .map((m) => m.player.id),
    );
    const eliteInPool = setup.draftPool.filter((p) => top12.has(p.id));
    expect(eliteInPool).toHaveLength(4);
  });

  it('covers every position deeply enough to draft a legal roster', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const setup = buildRealLeague(FIXTURE_DATASET, createRng(seed));
      for (const position of POSITIONS) {
        const count = setup.draftPool.filter((p) => p.position === position).length;
        expect(count).toBeGreaterThanOrEqual(MIN_PER_POSITION);
      }
    }
  });

  it('keeps the depth tier at minimum salary so a 15-man roster stays affordable', () => {
    // Real datasets too: the 2K distribution is compressed, so salaries come
    // from league rank, not raw overall (see salaryOverallForRank).
    for (const dataset of [FIXTURE_DATASET, REAL_DATASET]) {
      const setup = buildRealLeague(dataset, createRng(21));
      const minSalaryPlayers = setup.draftPool.filter((p) => p.salary === 2);
      expect(minSalaryPlayers.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('is deterministic for the same rng seed', () => {
    expect(buildRealLeague(FIXTURE_DATASET, createRng(99))).toEqual(
      buildRealLeague(FIXTURE_DATASET, createRng(99)),
    );
  });

  it('applies the CPU overall bonus', () => {
    const base = buildRealLeague(FIXTURE_DATASET, createRng(5), 0);
    const hard = buildRealLeague(FIXTURE_DATASET, createRng(5), 5);
    const avg = (teams: typeof base.league) =>
      teams.flatMap((t) => t.players).reduce((s, p) => s + p.overall, 0) /
      teams.flatMap((t) => t.players).length;
    expect(avg(hard.league)).toBeGreaterThan(avg(base.league));
  });
});

describe('sampleRealFreeAgents', () => {
  it('excludes rostered players and respects the overall ceiling', () => {
    const mapped = mapDatasetPlayers(FIXTURE_DATASET);
    const exclude = new Set(mapped.slice(0, 100).map((m) => m.player.id));
    const agents = sampleRealFreeAgents(FIXTURE_DATASET, createRng(3), exclude);
    expect(agents).toHaveLength(10);
    for (const agent of agents) {
      expect(exclude.has(agent.id)).toBe(false);
      expect(agent.overall).toBeLessThanOrEqual(REAL_FA_MAX_OVERALL);
    }
  });

  it('falls back to procedural players when the pot runs dry', () => {
    const everyone = new Set(mapDatasetPlayers(FIXTURE_DATASET).map((m) => m.player.id));
    const agents = sampleRealFreeAgents(FIXTURE_DATASET, createRng(3), everyone);
    expect(agents).toHaveLength(10);
    expect(agents.every((a) => a.id.startsWith('gen-'))).toBe(true);
  });
});

describe('isValidNbaDataset', () => {
  it('accepts the fixture and the shipped dataset', () => {
    expect(isValidNbaDataset(FIXTURE_DATASET)).toBe(true);
    expect(isValidNbaDataset(REAL_DATASET)).toBe(true);
  });

  it('rejects malformed data', () => {
    expect(isValidNbaDataset(null)).toBe(false);
    expect(isValidNbaDataset({})).toBe(false);
    expect(isValidNbaDataset({ fetchedAt: 'x', teams: [] })).toBe(false);
  });
});

describe('createRun with a real dataset', () => {
  it('is deterministic and plays through a season', () => {
    const a = createRun(1234, 0, FIXTURE_DATASET);
    const b = createRun(1234, 0, FIXTURE_DATASET);
    expect(a).toEqual(b);
    expect(a.draft!.pool).toHaveLength(72);
    expect(a.league).toHaveLength(29);

    let run = startSeason(draftLegalRoster(a));
    expect(run.status).toBe('in-season');
    let guard = 0;
    while (run.status === 'in-season' && guard++ < 100) {
      run = playNextGame(run);
    }
    expect(['won', 'lost']).toContain(run.status);
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
