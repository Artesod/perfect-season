import {
  POSITIONS,
  randInt,
  shuffle,
  type NbaDataset,
  type Player,
  type RealPlayerRecord,
  type Rng,
  type Team,
} from '@perfect-season/shared';
import { generatePlayer, pWarForOverall, salaryForOverall } from './league';

/**
 * Real-NBA mode: builds the CPU league (which the team-roll draft picks
 * from) out of the scraped dataset in data/nba-players.json instead of
 * generating players. Salary, pWAR, and traits are derived (real contract
 * data is paywalled and would upset cap balance), so real players plug into
 * the existing cap and chemistry systems unchanged. Everything is seeded:
 * same seed + same dataset = same run.
 */

const clamp = (n: number) => Math.min(99, Math.max(40, n));

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Deterministic traits from ratings + position, using the chemistry
 * vocabulary from league.ts so synergies keep working. 1-2 traits per
 * player, mirroring the procedural generator.
 */
function deriveTraits(record: RealPlayerRecord): string[] {
  const { position, overall, threePoint, dunk } = record;
  const traits: string[] = [];

  if (threePoint >= 85) {
    traits.push('sharpshooter');
  } else if (threePoint >= 78) {
    traits.push(position === 'PF' || position === 'C' ? 'stretch-big' : 'catch-and-shoot');
  }

  switch (position) {
    case 'PG':
      traits.push(overall >= 88 ? 'ball-dominant' : 'playmaker');
      break;
    case 'SG':
      if (dunk >= 82) traits.push('slasher');
      else if (overall >= 85) traits.push('ball-dominant');
      else if (threePoint < 70) traits.push('pest-defender');
      break;
    case 'SF':
      if (overall >= 86) traits.push('point-forward');
      else if (dunk >= 82) traits.push('slasher');
      else traits.push('two-way');
      break;
    case 'PF':
      if (dunk >= 80) traits.push('rebounder');
      else if (overall >= 78) traits.push('post-scorer');
      else traits.push('two-way');
      break;
    case 'C':
      traits.push(overall >= 80 ? 'rim-protector' : 'rebounder');
      break;
  }

  const unique = [...new Set(traits)];
  if (unique.length === 0) unique.push('two-way');
  return unique.slice(0, 2);
}

function toPlayer(record: RealPlayerRecord, id: string, salaryOverall: number): Player {
  // Shooting/athleticism skew the player toward offense; the defensive side
  // absorbs the difference so overall stays the anchor (like the generator).
  const lean = Math.max(-6, Math.min(6, Math.round((record.threePoint + record.dunk - 120) / 12)));
  const overall = clamp(record.overall);
  return {
    id,
    name: record.name,
    position: record.position,
    overall,
    offense: clamp(overall + lean),
    defense: clamp(overall - lean),
    salary: Math.round(salaryForOverall(salaryOverall) * 10) / 10,
    pWAR: Math.round(pWarForOverall(overall) * 10) / 10,
    traits: deriveTraits(record),
    ...(record.imageUrl ? { imageUrl: record.imageUrl } : {}),
    ...(record.stats ? { stats: record.stats } : {}),
  };
}

interface MappedPlayer {
  player: Player;
  teamIndex: number;
}

/**
 * League-wide rank bands for salaries. The 2K rating distribution is
 * compressed (roughly 67-99) versus the procedural league (55-95), so
 * feeding raw 2K overalls into the salary curve would price end-of-bench
 * players like starters and make a legal 15-man roster impossible under the
 * cap. Instead each rank band maps onto the matching procedural overall
 * range for salary purposes: the depth band is genuinely minimum-salary,
 * superstars are supermax. The real 2K overall is kept for display and
 * on-court strength.
 */
const SALARY_RANK_BANDS: readonly {
  endRank: number;
  maxSalaryOverall: number;
  minSalaryOverall: number;
}[] = [
  { endRank: 12, maxSalaryOverall: 95, minSalaryOverall: 88 }, // superstars
  { endRank: 48, maxSalaryOverall: 87, minSalaryOverall: 80 }, // stars
  { endRank: 140, maxSalaryOverall: 79, minSalaryOverall: 72 }, // starters
  { endRank: 300, maxSalaryOverall: 71, minSalaryOverall: 64 }, // rotation
  { endRank: Number.POSITIVE_INFINITY, maxSalaryOverall: 63, minSalaryOverall: 55 }, // depth
];

function salaryOverallForRank(rank: number, total: number): number {
  let start = 0;
  for (const band of SALARY_RANK_BANDS) {
    const end = Math.min(band.endRank, total);
    if (rank < end) {
      const t = (rank - start) / Math.max(1, end - start);
      return band.maxSalaryOverall - t * (band.maxSalaryOverall - band.minSalaryOverall);
    }
    start = end;
  }
  return SALARY_RANK_BANDS[SALARY_RANK_BANDS.length - 1].minSalaryOverall;
}

/** Pure mapping of the whole dataset with stable, unique ids. */
export function mapDatasetPlayers(dataset: NbaDataset): MappedPlayer[] {
  const records = dataset.teams.flatMap((team, teamIndex) =>
    team.players.map((record) => ({ record, teamIndex })),
  );

  // League-wide rank (0 = best) with deterministic tie-breaks.
  const ranked = [...records].sort(
    (a, b) => b.record.overall - a.record.overall || a.record.name.localeCompare(b.record.name),
  );
  const rankByEntry = new Map(ranked.map((entry, rank) => [entry, rank]));

  const seen = new Map<string, number>();
  return records.map((entry) => {
    const base = `nba-${slugify(entry.record.name)}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const salaryOverall = salaryOverallForRank(rankByEntry.get(entry)!, records.length);
    return {
      player: toPlayer(entry.record, count === 0 ? base : `${base}-${count + 1}`, salaryOverall),
      teamIndex: entry.teamIndex,
    };
  });
}

/** Free agents skew weaker, matching generateFreeAgents' ceiling — no unsigned superstars. */
export const REAL_FA_MAX_OVERALL = 82;

/**
 * The 29-team CPU league from real rosters. The user's franchise replaces
 * one seeded real team; that team's players skip the league (they surface
 * through free agency instead). Drafting picks directly from these rosters
 * — removal of drafted players happens at startSeason.
 */
export function buildRealLeague(dataset: NbaDataset, rng: Rng, cpuOverallBonus = 0): Team[] {
  const mapped = mapDatasetPlayers(dataset);
  const removedIndex = randInt(rng, 0, dataset.teams.length - 1);

  const league: Team[] = [];
  dataset.teams.forEach((team, teamIndex) => {
    if (teamIndex === removedIndex) return;
    let players = mapped.filter((m) => m.teamIndex === teamIndex).map((m) => m.player);
    if (cpuOverallBonus !== 0) {
      players = players.map((p) => ({
        ...p,
        overall: clamp(p.overall + cpuOverallBonus),
        offense: clamp(p.offense + cpuOverallBonus),
        defense: clamp(p.defense + cpuOverallBonus),
      }));
    }
    league.push({ id: `cpu-${league.length + 1}`, name: team.name, players });
  });

  return league;
}

/**
 * Seeded free-agent sample from real players who are neither on the user's
 * roster nor a CPU roster (undrafted pool players, waived players, and
 * unsampled leftovers). Procedural fill-ins if the pot runs dry.
 */
export function sampleRealFreeAgents(
  dataset: NbaDataset,
  rng: Rng,
  excludeIds: ReadonlySet<string>,
  count = 10,
): Player[] {
  const candidates = mapDatasetPlayers(dataset)
    .map((m) => m.player)
    .filter((p) => !excludeIds.has(p.id) && p.overall <= REAL_FA_MAX_OVERALL);
  const sampled = shuffle(rng, candidates).slice(0, count);
  while (sampled.length < count) {
    sampled.push(generatePlayer(rng, { maxOverall: REAL_FA_MAX_OVERALL }));
  }
  return sampled;
}

/** Light structural check so the app can fall back to procedural players. */
export function isValidNbaDataset(dataset: unknown): dataset is NbaDataset {
  if (typeof dataset !== 'object' || dataset === null) return false;
  const d = dataset as NbaDataset;
  return (
    typeof d.fetchedAt === 'string' &&
    Array.isArray(d.teams) &&
    d.teams.length >= 30 &&
    d.teams.every(
      (t) =>
        typeof t.name === 'string' &&
        Array.isArray(t.players) &&
        t.players.length >= 8 &&
        t.players.every(
          (p) =>
            typeof p.name === 'string' &&
            (POSITIONS as readonly string[]).includes(p.position) &&
            typeof p.overall === 'number' &&
            typeof p.threePoint === 'number' &&
            typeof p.dunk === 'number',
        ),
    )
  );
}
