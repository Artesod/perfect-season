/**
 * Headless smoke test: drives full runs through the real UI store
 * (draft -> season -> free agency -> cards -> terminal) across several seeds
 * to verify the wiring end to end. Run with: npx tsx apps/web/scripts/smoke.ts
 */
import { MIN_PER_POSITION, ROSTER_SIZE } from '@perfect-season/shared';
import { canSign, currentFreeAgents, runCanDraft, validateRoster } from '@perfect-season/sim';
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
let triedFreeAgency = false;

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

assert(NBA_DATASET !== null, 'bundled NBA dataset should validate');

for (const seed of SEEDS) {
  // Alternate between real-NBA and procedural runs to exercise both paths.
  store.getState().newRun(seed, 0, seed % 2 === 0 ? NBA_DATASET : null);
  assert(store.getState().run!.status === 'drafting', 'run should start in drafting');

  // Greedy legal draft: cover positions first, then best affordable player.
  while (store.getState().run!.draft!.roster.length < ROSTER_SIZE) {
    const state = store.getState().run!;
    const draft = state.draft!;
    const byNeed = [...draft.pool].sort((a, b) => {
      const needA =
        draft.roster.filter((p) => p.position === a.position).length < MIN_PER_POSITION;
      const needB =
        draft.roster.filter((p) => p.position === b.position).length < MIN_PER_POSITION;
      if (needA !== needB) return needA ? -1 : 1;
      return b.overall - a.overall;
    });
    const pickable = byNeed.find((p) => runCanDraft(state, p.id).ok);
    assert(pickable !== undefined, 'no draftable player found');
    store.getState().draftPlayer(pickable!.id);
  }

  // Exercise undo + redraft once.
  const drafted = store.getState().run!.draft!.roster[14];
  store.getState().undraftPlayer(drafted.id);
  assert(store.getState().run!.draft!.roster.length === 14, 'undo should shrink roster');
  store.getState().draftPlayer(drafted.id);

  const validation = validateRoster(store.getState().run!.draft!.roster);
  assert(validation.valid, `drafted roster should be legal: ${validation.errors.join('; ')}`);

  store.getState().beginSeason();
  assert(store.getState().run!.status === 'in-season', 'season should have started');
  assert(store.getState().run!.season!.schedule.length === 82, 'schedule should be 82 games');

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

const meta = store.getState().meta;
assert(meta.totalRuns === SEEDS.length, `all runs should be recorded (got ${meta.totalRuns})`);
assert(meta.badges.includes('first-steps'), 'first-steps badge should be earned');
assert(meta.bestWins === bestWins, 'meta bestWins should track the deepest run');
assert(totalEvents > 0, 'at least one event should have fired across all runs');
assert(totalCardsResolved > 0, 'at least one event card should have been resolved');

console.log(
  `SMOKE OK: ${SEEDS.length} runs, best ${bestWins} wins, ${totalEvents} events, ` +
    `${totalCardsResolved} cards resolved, badges: ${meta.badges.join(', ')}`,
);
