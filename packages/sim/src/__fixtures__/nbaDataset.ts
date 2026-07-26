import {
  POSITIONS,
  type EraCategory,
  type EraDataset,
  type EraTeamRecord,
  type NbaDataset,
  type RealTeamRecord,
} from '@perfect-season/shared';

/**
 * Letter-only encoding for fixture names: person identity (personKey) is a
 * normalized name with digits stripped, so numeric fixture names would all
 * collapse into one "person". The P prefix keeps tokens clear of the
 * suffix-strip list (jr, ii, iv, …).
 */
function alpha(n: number): string {
  return `P${String.fromCharCode(97 + Math.floor(n / 26))}${String.fromCharCode(97 + (n % 26))}`;
}

/**
 * Deterministic fixture dataset shaped like data/nba-players.json: 30 teams,
 * 12 players each, overalls spread 55-97 so the rank tiers have real depth.
 * Built by arithmetic (no RNG) so tests are stable and the file stays small.
 */
function buildTeam(teamIndex: number): RealTeamRecord {
  const players = Array.from({ length: 12 }, (_, i) => {
    const spread = (teamIndex * 7 + i * 13) % 43; // 0-42, deterministic scatter
    return {
      name: `Fixture Player ${alpha(teamIndex)} ${alpha(i)}`,
      position: POSITIONS[(teamIndex + i) % POSITIONS.length],
      overall: 55 + spread,
      threePoint: 50 + ((teamIndex * 11 + i * 17) % 45),
      dunk: 40 + ((teamIndex * 5 + i * 23) % 55),
      // Half the fixture players have a headshot, half exercise the fallback.
      ...(i % 2 === 0
        ? { imageUrl: `https://example.com/headshots/${teamIndex + 1}-${i + 1}.png` }
        : {}),
      // Every third player has real per-game stats; the rest exercise the
      // "no stats available" path.
      ...(i % 3 === 0
        ? {
            stats: {
              season: '2025-26',
              gamesPlayed: 40 + (spread % 40),
              minutes: 12 + (spread % 24),
              points: 4 + (spread % 26),
              rebounds: 2 + (spread % 10),
              assists: 1 + (spread % 9),
              steals: (spread % 20) / 10,
              blocks: (spread % 15) / 10,
              fgPct: 0.4 + (spread % 15) / 100,
              threePct: 0.3 + (spread % 12) / 100,
            },
          }
        : {}),
    };
  });
  return { name: `Fixture Team ${teamIndex + 1}`, players };
}

export const FIXTURE_DATASET: NbaDataset = {
  fetchedAt: '2026-01-01',
  source: 'fixture',
  teams: Array.from({ length: 30 }, (_, i) => buildTeam(i)),
};

/**
 * Era fixture shaped like data/nba-players-eras.json: 60 classic + 25
 * all-time teams, 10 players each, overalls skewed high (75-99) like real
 * era pools. Player names draw from a shared pool of 250 "persons" so the
 * same person appears on several teams — the duplicate-version case the
 * roster rules must handle. A person keeps their position everywhere.
 */
function buildEraTeam(index: number, category: EraCategory): EraTeamRecord {
  const players = Array.from({ length: 10 }, (_, i) => {
    const person = (index * 10 + i * 7) % 250;
    return {
      name: `Era Person ${alpha(person)}`,
      position: POSITIONS[person % POSITIONS.length],
      overall: 75 + ((index * 7 + i * 13) % 25),
      threePoint: 50 + ((index * 11 + i * 17) % 45),
      dunk: 40 + ((index * 5 + i * 23) % 55),
    };
  });
  if (category === 'all-time') {
    return {
      name: `All-Time Fixture ${index + 1}`,
      category,
      era: 'All-Time',
      slug: `all-time-fixture-${index + 1}`,
      players,
    };
  }
  const startYear = 1960 + index;
  const era = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  return {
    name: `${era} Fixture Classic ${index + 1}`,
    category,
    era,
    slug: `${era}-fixture-classic-${index + 1}`,
    players,
  };
}

export const FIXTURE_ERA_DATASET: EraDataset = {
  fetchedAt: '2026-01-01',
  source: 'fixture',
  teams: [
    ...Array.from({ length: 60 }, (_, i) => buildEraTeam(i, 'classic')),
    ...Array.from({ length: 25 }, (_, i) => buildEraTeam(60 + i, 'all-time')),
  ],
};
