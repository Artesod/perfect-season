import { POSITIONS, type NbaDataset, type RealTeamRecord } from '@perfect-season/shared';

/**
 * Deterministic fixture dataset shaped like data/nba-players.json: 30 teams,
 * 12 players each, overalls spread 55-97 so the rank tiers have real depth.
 * Built by arithmetic (no RNG) so tests are stable and the file stays small.
 */
function buildTeam(teamIndex: number): RealTeamRecord {
  const players = Array.from({ length: 12 }, (_, i) => {
    const spread = (teamIndex * 7 + i * 13) % 43; // 0-42, deterministic scatter
    return {
      name: `Fixture Player ${teamIndex + 1}-${i + 1}`,
      position: POSITIONS[(teamIndex + i) % POSITIONS.length],
      overall: 55 + spread,
      threePoint: 50 + ((teamIndex * 11 + i * 17) % 45),
      dunk: 40 + ((teamIndex * 5 + i * 23) % 55),
    };
  });
  return { name: `Fixture Team ${teamIndex + 1}`, players };
}

export const FIXTURE_DATASET: NbaDataset = {
  fetchedAt: '2026-01-01',
  source: 'fixture',
  teams: Array.from({ length: 30 }, (_, i) => buildTeam(i)),
};
