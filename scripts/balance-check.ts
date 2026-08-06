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
  runCanPick,
  runPickPlayer,
  runRerollTeam,
  startSeason,
} from '@perfect-season/sim';

const eras: EraDataset = JSON.parse(
  readFileSync(join(__dirname, '../data/nba-players-eras.json'), 'utf-8'),
);

const factors = [6, 4.5, 3.5, 3];
for (const seed of [1, 2, 3]) {
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
  run = startSeason(run);
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
