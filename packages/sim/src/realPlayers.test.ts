import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng, ROSTER_SIZE, type RunState, type Team } from '@perfect-season/shared';
import { FIXTURE_DATASET } from './__fixtures__/nbaDataset';
import { MAX_ASCENSION } from './difficulty';
import { draftCandidates } from './draft';
import {
  buildRealLeague,
  isValidNbaDataset,
  mapDatasetPlayers,
  REAL_FA_MAX_OVERALL,
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

  it('carries headshot URLs through and leaves them unset otherwise', () => {
    const mapped = mapDatasetPlayers(FIXTURE_DATASET);
    const withImage = mapped.filter((m) => m.player.imageUrl !== undefined);
    expect(withImage.length).toBeGreaterThan(0);
    expect(withImage.length).toBeLessThan(mapped.length);
    for (const { player } of withImage) {
      expect(player.imageUrl).toMatch(/^https:\/\//);
    }
  });

  it('carries per-game stats through and leaves them unset otherwise', () => {
    const mapped = mapDatasetPlayers(FIXTURE_DATASET);
    const withStats = mapped.filter((m) => m.player.stats !== undefined);
    expect(withStats.length).toBeGreaterThan(0);
    expect(withStats.length).toBeLessThan(mapped.length);
    for (const { player } of withStats) {
      expect(player.stats!.points).toBeGreaterThanOrEqual(0);
      expect(player.stats!.season).toBe('2025-26');
    }
  });

  it('keeps depth players at minimum salary so a 15-man roster stays affordable', () => {
    // The 2K distribution is compressed, so salaries come from league rank,
    // not raw overall (see salaryOverallForRank). Both fixture and shipped
    // datasets must produce a healthy minimum-salary bracket.
    for (const dataset of [FIXTURE_DATASET, REAL_DATASET]) {
      const minSalaryPlayers = mapDatasetPlayers(dataset).filter((m) => m.player.salary === 2);
      expect(minSalaryPlayers.length).toBeGreaterThanOrEqual(100);
    }
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

  it('is deterministic for the same rng seed', () => {
    expect(buildRealLeague(FIXTURE_DATASET, createRng(99))).toEqual(
      buildRealLeague(FIXTURE_DATASET, createRng(99)),
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
