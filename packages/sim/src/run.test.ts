import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROSTER_SIZE, type EventCard, type RunState } from '@perfect-season/shared';
import { validateRoster } from './cap';
import { MAX_ASCENSION } from './difficulty';
import { draftCandidates } from './draft';
import {
  CASUAL_CPU_REDUCTION,
  createRun,
  currentFreeAgents,
  playNextGame,
  resolvePendingCard,
  runCanPick,
  runCapReduction,
  runPickPlayer,
  runRerollTeam,
  runSignPlayer,
  runWaivePlayer,
  startSeason,
  USER_TEAM_ID,
} from './run';

const CARDS: EventCard[] = JSON.parse(
  readFileSync(join(__dirname, '../../../data/event-cards.json'), 'utf-8'),
);

/** Draft a strong-but-legal roster: best legal pick each round, reroll if none. */
function draftStrongRoster(run: RunState): RunState {
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

function playUntilDone(run: RunState, maxGames = 100): RunState {
  let games = 0;
  while (run.status === 'in-season' && games < maxGames) {
    if (run.season!.pendingCard) {
      const card = CARDS.find((c) => c.id === run.season!.pendingCard!.cardId)!;
      run = resolvePendingCard(run, CARDS, card.choices[0].id);
    }
    run = playNextGame(run, CARDS);
    games++;
  }
  return run;
}

describe('createRun', () => {
  it('is deterministic and starts in drafting with a rolled team', () => {
    const a = createRun(42);
    const b = createRun(42);
    expect(a).toEqual(b);
    expect(a.status).toBe('drafting');
    expect(a.league).toHaveLength(29);
    expect(a.league.some((t) => t.id === a.draft!.rolledTeamId)).toBe(true);
    expect(a.draft!.roster).toHaveLength(0);
  });

  it('higher ascension produces stronger CPU teams', () => {
    const base = createRun(7, 0);
    const hard = createRun(7, MAX_ASCENSION);
    const avg = (run: RunState) =>
      run.league.flatMap((t) => t.players).reduce((s, p) => s + p.overall, 0) /
      run.league.flatMap((t) => t.players).length;
    expect(avg(hard)).toBeGreaterThan(avg(base));
  });

  it('casual mode removes the cap and handicaps the CPU at season start', () => {
    const standard = createRun(9, 0);
    const casual = createRun(9, 0, undefined, true);
    expect(standard.casual).toBe(false);
    expect(casual.casual).toBe(true);
    // Same seed, same world at creation — you draft full-rated players.
    expect(casual.league).toEqual(standard.league);
    expect(runCapReduction(standard)).toBe(0);
    expect(runCapReduction(casual)).toBe(Number.NEGATIVE_INFINITY);

    // At season start every remaining CPU player drops by the handicap
    // (drafted players keep their ratings; fill-ins are new players).
    const drafted = draftStrongRoster(casual);
    const before = new Map(drafted.league.flatMap((t) => t.players).map((p) => [p.id, p.overall]));
    const started = startSeason(drafted);
    for (const p of started.league.flatMap((t) => t.players)) {
      const original = before.get(p.id);
      if (original !== undefined) {
        expect(p.overall).toBe(Math.max(40, original - CASUAL_CPU_REDUCTION));
      }
    }
    for (const p of started.roster) {
      expect(p.overall).toBe(before.get(p.id));
    }
    // No cap even at max ascension — the squeeze doesn't apply in casual.
    expect(runCapReduction(createRun(9, MAX_ASCENSION, undefined, true))).toBe(
      Number.NEGATIVE_INFINITY,
    );
    // Any roster passes the cap check: -Infinity reduction means infinite space.
    const priciest = [...casual.league.flatMap((t) => t.players)]
      .sort((a, b) => b.salary - a.salary)
      .slice(0, 15);
    expect(
      validateRoster(priciest, runCapReduction(casual)).errors.some((e) => e.includes('cap')),
    ).toBe(false);
  });
});

describe('run lifecycle', () => {
  it('cannot start the season with an illegal roster', () => {
    const run = createRun(1);
    expect(() => startSeason(run)).toThrow(/not legal/);
  });

  it('removes drafted players from their CPU teams at season start', () => {
    const run = startSeason(draftStrongRoster(createRun(2024)));
    const draftedIds = new Set(run.roster.map((p) => p.id));
    const leagueIds = run.league.flatMap((t) => t.players.map((p) => p.id));
    expect(leagueIds.some((id) => draftedIds.has(id))).toBe(false);
    // Fill-ins keep every CPU roster at rotation depth.
    for (const team of run.league) {
      expect(team.players.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('plays a full run to a terminal status, deterministically', () => {
    const run = startSeason(draftStrongRoster(createRun(1234)));
    expect(run.status).toBe('in-season');
    expect(run.season!.schedule).toHaveLength(82);

    const done = playUntilDone(run);
    expect(['won', 'lost']).toContain(done.status);
    expect(done.wins + done.losses).toBe(done.season!.results.length);

    const replay = playUntilDone(startSeason(draftStrongRoster(createRun(1234))));
    expect(replay).toEqual(done);
  });

  it('a loss ends the run at base difficulty', () => {
    // Find a seed whose run ends in a loss before 82-0.
    for (let seed = 1; seed < 50; seed++) {
      const done = playUntilDone(startSeason(draftStrongRoster(createRun(seed))));
      if (done.status === 'lost') {
        expect(done.livesRemaining).toBe(0);
        expect(done.losses).toBe(1);
        return;
      }
    }
    throw new Error('Expected at least one losing run across 50 seeds');
  });

  it('blocks playing while a card is pending', () => {
    let run = startSeason(draftStrongRoster(createRun(1234)));
    let guard = 0;
    while (!run.season!.pendingCard && run.status === 'in-season' && guard < 100) {
      run = playNextGame(run, CARDS);
      guard++;
    }
    if (run.season!.pendingCard) {
      expect(() => playNextGame(run, CARDS)).toThrow(/pending/);
      const card = CARDS.find((c) => c.id === run.season!.pendingCard!.cardId)!;
      const resolved = resolvePendingCard(run, CARDS, card.choices[0].id);
      expect(resolved.season!.pendingCard).toBeNull();
    }
  });
});

describe('in-season free agency', () => {
  it('waiving adds dead cap and signing respects it', () => {
    let run = startSeason(draftStrongRoster(createRun(99)));
    // Waive the priciest player: half their salary comes back as usable space.
    const victim = [...run.roster].sort((a, b) => b.salary - a.salary)[0];
    run = runWaivePlayer(run, victim.id);
    expect(run.roster).toHaveLength(ROSTER_SIZE - 1);
    expect(run.season!.deadCap).toBe(Math.round(victim.salary * 0.5 * 10) / 10);

    const agents = currentFreeAgents(run);
    expect(agents.length).toBeGreaterThan(0);
    const cheap = [...agents].sort((a, b) => a.salary - b.salary)[0];
    run = runSignPlayer(run, cheap);
    expect(run.roster).toHaveLength(ROSTER_SIZE);
    expect(run.roster.some((p) => p.id === cheap.id)).toBe(true);
  });

  it('free-agent pool is stable within a window and refreshes later', () => {
    let run = startSeason(draftStrongRoster(createRun(555)));
    const initial = currentFreeAgents(run);
    expect(currentFreeAgents(run)).toEqual(initial);

    for (let i = 0; i < 10 && run.status === 'in-season'; i++) {
      if (run.season!.pendingCard) {
        const card = CARDS.find((c) => c.id === run.season!.pendingCard!.cardId)!;
        run = resolvePendingCard(run, CARDS, card.choices[0].id);
      }
      run = playNextGame(run, CARDS);
    }
    if (run.status === 'in-season') {
      expect(currentFreeAgents(run)).not.toEqual(initial);
    }
  });
});

describe('user team id', () => {
  it('never collides with CPU team ids', () => {
    const run = createRun(3);
    expect(run.league.every((t) => t.id !== USER_TEAM_ID)).toBe(true);
  });
});
