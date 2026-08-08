/**
 * One-off balance probe: draft a greedy casual all-time roster and report
 * the win-probability spread against the league under different upset
 * factors. Run: npx tsx scripts/balance-check.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EraDataset, Team } from '@perfect-season/shared';
import {
  createRun,
  draftCandidates,
  effectiveStrength,
  playNextGame,
  runCanPick,
  runPickPlayer,
  runRerollTeam,
  runResolveNagging,
  startSeason,
} from '@perfect-season/sim';

/** Play one game, sitting out any pending nagging injury (no card pool here). */
function playThrough(run: ReturnType<typeof createRun>) {
  if (run.season!.pendingNagging) run = runResolveNagging(run, 'sit');
  return playNextGame(run);
}

const eras: EraDataset = JSON.parse(
  readFileSync(join(__dirname, '../data/nba-players-eras.json'), 'utf-8'),
);

function draftAndStart(seed: number) {
  let run = createRun(seed, 0, { mode: 'all-time', eras }, true);
  let guard = 0;
  while (run.draft!.roster.length < 15 && guard++ < 300) {
    const legal = draftCandidates(run.draft!, run.league)
      .filter((p) => runCanPick(run, p.id).ok)
      .sort((a, b) => b.overall - a.overall);
    if (legal.length === 0) {
      run = runRerollTeam(run);
      continue;
    }
    run = runPickPlayer(run, legal[0].id);
  }
  return startSeason(run);
}

const factors = [6, 4.5, 3.5, 3];
for (const seed of [1, 2, 3]) {
  const run = draftAndStart(seed);
  const user: Team = { id: 'user', name: 'You', players: run.roster };
  const mine = effectiveStrength(user);
  const diffs = run.league.map((t) => mine - effectiveStrength(t));
  const avg = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const min = Math.min(...diffs);
  console.log(
    `seed ${seed}: strength ${mine.toFixed(1)}, diff avg ${avg.toFixed(1)} / worst ${min.toFixed(1)}`,
  );
  for (const f of factors) {
    const p = (d: number) => 1 / (1 + Math.exp(-d / f));
    const season = diffs.map((d) => p(d));
    const geomean = Math.exp(season.reduce((s, x) => s + Math.log(x), 0) / season.length);
    console.log(
      `  factor ${f}: avg P ${((season.reduce((s, x) => s + x, 0) / season.length) * 100).toFixed(0)}%, vs best team ${(p(min) * 100).toFixed(0)}%, median run length ~${Math.round(Math.log(0.5) / Math.log(geomean))} games`,
    );
  }
}

// Full-season outcomes under the live sim (current constants + casual lives).
const SEASONS = 40;
let won = 0;
const records: string[] = [];
for (let seed = 1; seed <= SEASONS; seed++) {
  let run = draftAndStart(seed);
  let guard = 0;
  while (run.status === 'in-season' && guard++ < 200) {
    run = playThrough(run);
  }
  if (run.status === 'won') won++;
  records.push(`${run.wins}-${run.losses}`);
}
console.log(`\ncasual all-time, ${SEASONS} greedy seasons: ${won} won (${((won / SEASONS) * 100).toFixed(0)}%)`);
console.log(`records: ${records.join(' ')}`);

// Loss distribution over full 82-game seasons (unlimited lives) → win rate per lives setting.
const lossCounts: number[] = [];
for (let seed = 1; seed <= SEASONS; seed++) {
  let run = { ...draftAndStart(seed), livesRemaining: 999 };
  let guard = 0;
  while (run.status === 'in-season' && guard++ < 200) {
    run = playThrough(run);
  }
  lossCounts.push(run.losses);
}
for (const lives of [3, 5, 8, 10, 12]) {
  const w = lossCounts.filter((l) => l < lives).length;
  console.log(`lives ${lives}: ${((w / SEASONS) * 100).toFixed(0)}% of seasons won`);
}
console.log(`full-season losses: ${[...lossCounts].sort((a, b) => a - b).join(' ')}`);
