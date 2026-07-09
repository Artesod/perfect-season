/**
 * Headless smoke test: drives full runs through the real UI store
 * (draft -> season -> free agency -> cards -> terminal) across several seeds
 * to verify the wiring end to end. Run with: npx tsx apps/web/scripts/smoke.ts
 */
import { ROSTER_SIZE } from '@perfect-season/shared';
import {
  canSign,
  currentFreeAgents,
  draftCandidates,
  runCanPick,
  runCanReroll,
  validateRoster,
} from '@perfect-season/sim';
import { EVENT_CARDS } from '../src/cards';
import { NBA_DATASET } from '../src/nbaData';
import { useGameStore } from '../src/store';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
}

const store = useGameStore;
assert(EVENT_CARDS.length === 12, `expected 12 cards, got ${EVENT_CARDS.length}`);

let totalCardsResolved = 0;
let totalEvents = 0;
let bestWins = 0;
let totalRerolls = 0;
let runsPlayed = 0;
let triedFreeAgency = false;
let triedTokenReroll = false;

const BASE_SEEDS = 20;
// Runs at ascension 0 end on the first loss, so most are only a few games
// long and whether a morale card fires in a given seed is luck. After the
// base seeds, keep trying until one has fired so the card path is always
// exercised.
const MAX_SEEDS = 500;

assert(NBA_DATASET !== null, 'bundled NBA dataset should validate');

function playSeed(seed: number): void {
  runsPlayed++;
  // Alternate between real-NBA and procedural runs to exercise both paths.
  store.getState().newRun(seed, 0, seed % 2 === 0 ? NBA_DATASET : null);
  assert(store.getState().run!.status === 'drafting', 'run should start in drafting');

  // Team-roll draft: pick the best legal player from each rolled team,
  // rerolling when a round offers no legal pick (or, once overall, to
  // exercise the token path).
  let draftGuard = 0;
  while (store.getState().run!.draft!.roster.length < ROSTER_SIZE && draftGuard++ < 200) {
    const state = store.getState().run!;
    const legal = draftCandidates(state.draft!, state.league)
      .filter((p) => runCanPick(state, p.id).ok)
      .sort((a, b) => b.overall - a.overall);

    const reroll = runCanReroll(state);
    if (legal.length === 0) {
      assert(reroll.allowed && reroll.free, 'reroll should be free when no legal pick exists');
      store.getState().rerollTeam();
      totalRerolls++;
      continue;
    }
    if (!triedTokenReroll && state.draft!.rerollsLeft > 0 && state.draft!.roster.length === 3) {
      const before = state.draft!.rerollsLeft;
      store.getState().rerollTeam();
      assert(
        store.getState().run!.draft!.rerollsLeft === before - 1,
        'token reroll should spend a token',
      );
      triedTokenReroll = true;
      totalRerolls++;
      continue;
    }
    store.getState().pickPlayer(legal[0].id);
  }
  assert(
    store.getState().run!.draft!.roster.length === ROSTER_SIZE,
    'draft should complete a 15-man roster',
  );

  const validation = validateRoster(store.getState().run!.draft!.roster);
  assert(validation.valid, `drafted roster should be legal: ${validation.errors.join('; ')}`);

  store.getState().beginSeason();
  assert(store.getState().run!.status === 'in-season', 'season should have started');
  assert(store.getState().run!.season!.schedule.length === 82, 'schedule should be 82 games');
  {
    // Drafted players must be gone from CPU rosters once the season starts.
    const started = store.getState().run!;
    const draftedIds = new Set(started.roster.map((p) => p.id));
    const stillRostered = started.league
      .flatMap((t) => t.players)
      .some((p) => draftedIds.has(p.id));
    assert(!stillRostered, 'drafted players should leave their CPU teams');
    assert(
      started.league.every((t) => t.players.length >= 10),
      'CPU teams should keep rotation depth',
    );
  }

  // Once, mid-first-run: waive a player and sign a free agent. Waive someone
  // pricey enough that the freed half-salary can actually afford a signing.
  if (!triedFreeAgency) {
    const before = store.getState().run!;
    const waivable =
      [...before.roster].sort((a, b) => a.overall - b.overall).find((p) => p.salary >= 8) ??
      before.roster[0];
    store.getState().waivePlayer(waivable.id);
    const afterWaive = store.getState().run!;
    assert(afterWaive.roster.length === ROSTER_SIZE - 1, 'waive should shrink roster');
    assert(afterWaive.season!.deadCap > 0, 'waive should incur dead cap');

    const agents = currentFreeAgents(afterWaive);
    const deadCap = afterWaive.season!.deadCap;
    const signable = [...agents]
      .sort((a, b) => b.overall - a.overall)
      .find((p) => canSign(afterWaive.roster, p, deadCap).ok);
    assert(signable !== undefined, 'no signable free agent found');
    store.getState().signFreeAgent(signable!);
    assert(store.getState().run!.roster.length === ROSTER_SIZE, 'sign should refill roster');
    triedFreeAgency = true;
  }

  // Play the season out, resolving cards as they fire; alternate play styles.
  let guard = 0;
  while (store.getState().run!.status === 'in-season' && guard++ < 500) {
    const state = store.getState().run!;
    if (state.season!.pendingCard) {
      const card = EVENT_CARDS.find((c) => c.id === state.season!.pendingCard!.cardId)!;
      store.getState().resolveCard(card.choices[totalCardsResolved % 2].id);
      totalCardsResolved++;
    } else if (seed % 2 === 0) {
      store.getState().simToNextEvent();
    } else {
      store.getState().playGame();
    }
  }

  const run = store.getState().run!;
  assert(
    run.status === 'won' || run.status === 'lost',
    `run should be terminal, is ${run.status}`,
  );
  assert(run.wins + run.losses === run.season!.results.length, 'record should match results');
  totalEvents += run.season!.events.length;
  bestWins = Math.max(bestWins, run.wins);
}

for (let seed = 1; seed <= BASE_SEEDS; seed++) {
  playSeed(seed);
}
for (let seed = BASE_SEEDS + 1; seed <= MAX_SEEDS && totalCardsResolved === 0; seed++) {
  playSeed(seed);
}

const meta = store.getState().meta;
assert(meta.totalRuns === runsPlayed, `all runs should be recorded (got ${meta.totalRuns})`);
assert(meta.badges.includes('first-steps'), 'first-steps badge should be earned');
assert(meta.bestWins === bestWins, 'meta bestWins should track the deepest run');
assert(totalEvents > 0, 'at least one event should have fired across all runs');
assert(totalCardsResolved > 0, 'at least one event card should have been resolved');
assert(triedTokenReroll, 'token reroll path should have been exercised');

console.log(
  `SMOKE OK: ${runsPlayed} runs, best ${bestWins} wins, ${totalEvents} events, ` +
    `${totalCardsResolved} cards resolved, ${totalRerolls} rerolls, badges: ${meta.badges.join(', ')}`,
);
