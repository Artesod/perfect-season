/**
 * Trait calibration probe: prints trait frequency per pool and names the
 * ball-dominant players so thresholds can be sanity-checked against real
 * basketball knowledge. Run: npx tsx scripts/trait-audit.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EraDataset, NbaDataset, PlayerPool } from '@perfect-season/shared';
import { mapPoolPlayers } from '@perfect-season/sim';

const dir = join(__dirname, '..', 'data');
const nba: NbaDataset = JSON.parse(readFileSync(join(dir, 'nba-players.json'), 'utf-8'));
const eras: EraDataset = JSON.parse(readFileSync(join(dir, 'nba-players-eras.json'), 'utf-8'));

const pools: PlayerPool[] = [
  { mode: 'current', nba },
  { mode: 'classic', eras },
  { mode: 'all-time', eras },
];

for (const pool of pools) {
  const players = mapPoolPlayers(pool).map((m) => m.player);
  const counts = new Map<string, number>();
  for (const p of players) for (const t of p.traits) counts.set(t, (counts.get(t) ?? 0) + 1);
  console.log(`\n== ${pool.mode} (${players.length} players) ==`);
  for (const [trait, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${trait.padEnd(16)} ${n} (${((n / players.length) * 100).toFixed(1)}%)`);
  }
  const cooks = players.filter((p) => p.traits.includes('ball-dominant')).map((p) => p.name);
  console.log(`  ball-dominant: ${cooks.slice(0, 25).join(', ')}${cooks.length > 25 ? ', …' : ''}`);
}
