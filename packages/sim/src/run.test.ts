import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIN_PER_POSITION,
  POSITIONS,
  ROSTER_SIZE,
  type EventCard,
  type RunState,
} from '@perfect-season/shared';
import { MAX_ASCENSION } from './difficulty';
import {
  createRun,
  currentFreeAgents,
  playNextGame,
  resolvePendingCard,
  runDraftPlayer,
  runSignPlayer,
  runWaivePlayer,
  startSeason,
  USER_TEAM_ID,
} from './run';

const CARDS: EventCard[] = JSON.parse(
  readFileSync(join(__dirname, '../../../data/event-cards.json'), 'utf-8'),
);

/** Draft a strong-but-legal roster: best affordable per position first. */
function draftStrongRoster(run: RunState): RunState {
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
    // Best remaining player that the feasibility guard allows.
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
  it('is deterministic and starts in drafting', () => {
    const a = createRun(42);
    const b = createRun(42);
    expect(a).toEqual(b);
    expect(a.status).toBe('drafting');
    expect(a.league).toHaveLength(29);
    expect(a.draft!.pool.length).toBeGreaterThan(0);
  });

  it('higher ascension produces stronger CPU teams', () => {
    const base = createRun(7, 0);
    const hard = createRun(7, MAX_ASCENSION);
    const avg = (run: RunState) =>
      run.league.flatMap((t) => t.players).reduce((s, p) => s + p.overall, 0) /
      run.league.flatMap((t) => t.players).length;
    expect(avg(hard)).toBeGreaterThan(avg(base));
  });
});

describe('run lifecycle', () => {
  it('cannot start the season with an illegal roster', () => {
    const run = createRun(1);
    expect(() => startSeason(run)).toThrow(/not legal/);
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
