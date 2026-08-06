import {
  POSITIONS,
  randInt,
  shuffle,
  type EraDataset,
  type NbaDataset,
  type Player,
  type PlayerPool,
  type RealPlayerRecord,
  type Rng,
  type Team,
} from '@perfect-season/shared';
import { generatePlayer, pWarForOverall, salaryForOverall } from './league';

/**
 * Real-NBA mode: builds the CPU league (which the team-roll draft picks
 * from) out of scraped datasets instead of generating players. The pool can
 * be the current season's rosters, classic historical teams, all-time
 * franchise teams, or all of them mixed (see PlayerPool). Salary, pWAR, and
 * traits are derived (real contract data is paywalled and would upset cap
 * balance), so real players plug into the existing cap and chemistry systems
 * unchanged. Everything is seeded: same seed + same pool = same run.
 */

/** Accepted by every pool function: a bare current dataset or a full pool. */
export type PoolSource = NbaDataset | PlayerPool;

export function normalizePool(source: PoolSource): PlayerPool {
  return 'mode' in source ? source : { mode: 'current', nba: source };
}

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
 * Normalized person identity: no case/accents/suffixes ("Jr", "III", …).
 * Every era version of the same person shares this key, which is how roster
 * rules forbid stacking '91 and '96 Jordan on one team.
 */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((token) => !['jr', 'sr', 'ii', 'iii', 'iv', 'v'].includes(token))
    .join(' ');
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

/** A team contributing players to the pool, with era metadata resolved. */
interface SourceTeam {
  /** Display name, era-qualified for era teams (e.g. "1985-86 Chicago Bulls") */
  name: string;
  /** Player-id prefix: "nba" for current rosters, "era-{slug}" for era teams */
  idPrefix: string;
  /** Display-name suffix marking the era version (e.g. "'86", "(All-Time)") */
  nameSuffix?: string;
  players: RealPlayerRecord[];
}

/** The teams a pool draws from, in a stable order (current, then eras). */
function poolSourceTeams(pool: PlayerPool): SourceTeam[] {
  const teams: SourceTeam[] = [];
  if ((pool.mode === 'current' || pool.mode === 'mixed') && pool.nba) {
    for (const team of pool.nba.teams) {
      teams.push({ name: team.name, idPrefix: 'nba', players: team.players });
    }
  }
  if (pool.mode !== 'current' && pool.eras) {
    for (const team of pool.eras.teams) {
      if (pool.mode !== 'mixed' && team.category !== pool.mode) continue;
      teams.push({
        name: team.name,
        idPrefix: `era-${team.slug}`,
        nameSuffix: team.category === 'classic' ? `'${team.era.slice(-2)}` : '(All-Time)',
        players: team.players,
      });
    }
  }
  return teams;
}

function toPlayer(
  record: RealPlayerRecord,
  id: string,
  salaryOverall: number,
  team: SourceTeam,
): Player {
  // Shooting/athleticism skew the player toward offense; the defensive side
  // absorbs the difference so overall stays the anchor (like the generator).
  const lean = Math.max(-6, Math.min(6, Math.round((record.threePoint + record.dunk - 120) / 12)));
  const overall = clamp(record.overall);
  return {
    id,
    name: team.nameSuffix ? `${record.name} ${team.nameSuffix}` : record.name,
    position: record.position,
    ...(record.altPositions && record.altPositions.length > 0
      ? { altPositions: record.altPositions }
      : {}),
    overall,
    offense: clamp(overall + lean),
    defense: clamp(overall - lean),
    salary: Math.round(salaryForOverall(salaryOverall) * 10) / 10,
    pWAR: Math.round(pWarForOverall(overall) * 10) / 10,
    traits: deriveTraits(record),
    personKey: nameKey(record.name),
    ...(team.nameSuffix ? { eraTeam: team.name } : {}),
    ...(record.imageUrl ? { imageUrl: record.imageUrl } : {}),
    ...(record.stats ? { stats: record.stats } : {}),
  };
}

export interface MappedPlayer {
  player: Player;
  teamIndex: number;
  /** Pool-wide rank by overall, 0 = best; salaries and FA eligibility key off it */
  rank: number;
}

/**
 * Pool-wide rank bands for salaries, as fractions of pool size. The 2K
 * rating distribution is compressed (roughly 67-99 for current rosters,
 * higher still for era pools full of Hall of Famers), so feeding raw 2K
 * overalls into the salary curve would price end-of-bench players like
 * starters and make a legal 15-man roster impossible under the cap. Instead
 * each rank band maps onto the matching procedural overall range for salary
 * purposes: the depth band is genuinely minimum-salary, superstars are
 * supermax. Fractions are calibrated to the old absolute ranks (12/48/140/
 * 300 of ~525 current players) and scale to any pool size, which is what
 * keeps the cap squeeze honest when an era pool is stacked with 90+ legends.
 * The real 2K overall is kept for display and on-court strength.
 */
const SALARY_RANK_BANDS: readonly {
  endFraction: number;
  maxSalaryOverall: number;
  minSalaryOverall: number;
}[] = [
  { endFraction: 0.023, maxSalaryOverall: 95, minSalaryOverall: 88 }, // superstars
  { endFraction: 0.09, maxSalaryOverall: 87, minSalaryOverall: 80 }, // stars
  { endFraction: 0.27, maxSalaryOverall: 79, minSalaryOverall: 72 }, // starters
  { endFraction: 0.57, maxSalaryOverall: 71, minSalaryOverall: 64 }, // rotation
  { endFraction: 1, maxSalaryOverall: 63, minSalaryOverall: 55 }, // depth
];

function salaryOverallForRank(rank: number, total: number): number {
  let start = 0;
  for (const band of SALARY_RANK_BANDS) {
    const end = Math.round(total * band.endFraction);
    if (rank < end) {
      const t = (rank - start) / Math.max(1, end - start);
      return band.maxSalaryOverall - t * (band.maxSalaryOverall - band.minSalaryOverall);
    }
    start = end;
  }
  return SALARY_RANK_BANDS[SALARY_RANK_BANDS.length - 1].minSalaryOverall;
}

/** Pure mapping of the whole pool with stable, unique ids. */
export function mapPoolPlayers(source: PoolSource): MappedPlayer[] {
  const teams = poolSourceTeams(normalizePool(source));
  const records = teams.flatMap((team, teamIndex) =>
    team.players.map((record) => ({ record, team, teamIndex })),
  );

  // Pool-wide rank (0 = best) with deterministic tie-breaks. Era versions of
  // one person can share both name and overall, so team name settles it.
  const ranked = [...records].sort(
    (a, b) =>
      b.record.overall - a.record.overall ||
      a.record.name.localeCompare(b.record.name) ||
      a.team.name.localeCompare(b.team.name),
  );
  const rankByEntry = new Map(ranked.map((entry, rank) => [entry, rank]));

  const seen = new Map<string, number>();
  return records.map((entry) => {
    const base = `${entry.team.idPrefix}-${slugify(entry.record.name)}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const rank = rankByEntry.get(entry)!;
    const salaryOverall = salaryOverallForRank(rank, records.length);
    return {
      player: toPlayer(
        entry.record,
        count === 0 ? base : `${base}-${count + 1}`,
        salaryOverall,
        entry.team,
      ),
      teamIndex: entry.teamIndex,
      rank,
    };
  });
}

/**
 * Free agents skew weaker: the top of the pool never sits unsigned. The
 * cutoff is a rank fraction (matching the old ≤82-overall rule on current
 * rosters) so it holds in era pools where nearly everyone rates 82+.
 */
export const REAL_FA_EXCLUDED_TOP_FRACTION = 0.18;

/** Ceiling for procedural fill-ins when the real FA pot runs dry. */
export const REAL_FA_FILL_MAX_OVERALL = 82;

/**
 * The CPU league from real rosters — one league team per pool team, so era
 * pools face you against the actual historical squads. The user's franchise
 * replaces one seeded team; that team's players skip the league (they
 * surface through free agency instead). Drafting picks directly from these
 * rosters — removal of drafted players happens at startSeason.
 */
export function buildRealLeague(source: PoolSource, rng: Rng, cpuOverallBonus = 0): Team[] {
  const teams = poolSourceTeams(normalizePool(source));
  const mapped = mapPoolPlayers(source);
  const removedIndex = randInt(rng, 0, teams.length - 1);

  const league: Team[] = [];
  teams.forEach((team, teamIndex) => {
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
  source: PoolSource,
  rng: Rng,
  excludeIds: ReadonlySet<string>,
  count = 10,
): Player[] {
  const mapped = mapPoolPlayers(source);
  const minRank = Math.round(mapped.length * REAL_FA_EXCLUDED_TOP_FRACTION);
  const candidates = mapped
    .filter((m) => m.rank >= minRank && !excludeIds.has(m.player.id))
    .map((m) => m.player);
  const sampled = shuffle(rng, candidates).slice(0, count);
  while (sampled.length < count) {
    sampled.push(generatePlayer(rng, { maxOverall: REAL_FA_FILL_MAX_OVERALL }));
  }
  return sampled;
}

function isValidPlayerRecord(p: RealPlayerRecord): boolean {
  return (
    typeof p.name === 'string' &&
    (POSITIONS as readonly string[]).includes(p.position) &&
    (p.altPositions === undefined ||
      (Array.isArray(p.altPositions) &&
        p.altPositions.every((pos) => (POSITIONS as readonly string[]).includes(pos)))) &&
    typeof p.overall === 'number' &&
    typeof p.threePoint === 'number' &&
    typeof p.dunk === 'number'
  );
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
        t.players.every(isValidPlayerRecord),
    )
  );
}

/** Same structural check for the era dataset; the UI hides era modes without it. */
export function isValidEraDataset(dataset: unknown): dataset is EraDataset {
  if (typeof dataset !== 'object' || dataset === null) return false;
  const d = dataset as EraDataset;
  return (
    typeof d.fetchedAt === 'string' &&
    Array.isArray(d.teams) &&
    d.teams.length >= 80 &&
    d.teams.some((t) => t.category === 'classic') &&
    d.teams.some((t) => t.category === 'all-time') &&
    d.teams.every(
      (t) =>
        typeof t.name === 'string' &&
        typeof t.era === 'string' &&
        typeof t.slug === 'string' &&
        (t.category === 'classic' || t.category === 'all-time') &&
        Array.isArray(t.players) &&
        // 2K rates as few as 7 players on some 1960s-70s classic rosters
        t.players.length >= 5 &&
        t.players.every(isValidPlayerRecord),
    )
  );
}
