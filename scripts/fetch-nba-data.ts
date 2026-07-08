/**
 * Scrapes current NBA rosters + 2K ratings from 2kratings.com into
 * data/nba-players.json. Run with: npm run fetch:nba
 *
 * Design-time data pipeline (see docs/ROADMAP.md decisions log): the game
 * bundles this JSON at build time; nothing is fetched at runtime, so runs
 * stay seeded and deterministic. A weekly GitHub Action re-runs this script
 * and commits the diff.
 */
import { load } from 'cheerio';
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { NbaDataset, Position, RealPlayerRecord, RealTeamRecord } from '@perfect-season/shared';

const TEAM_SLUGS = [
  'atlanta-hawks',
  'boston-celtics',
  'brooklyn-nets',
  'charlotte-hornets',
  'chicago-bulls',
  'cleveland-cavaliers',
  'dallas-mavericks',
  'denver-nuggets',
  'detroit-pistons',
  'golden-state-warriors',
  'houston-rockets',
  'indiana-pacers',
  'los-angeles-clippers',
  'los-angeles-lakers',
  'memphis-grizzlies',
  'miami-heat',
  'milwaukee-bucks',
  'minnesota-timberwolves',
  'new-orleans-pelicans',
  'new-york-knicks',
  'oklahoma-city-thunder',
  'orlando-magic',
  'philadelphia-76ers',
  'phoenix-suns',
  'portland-trail-blazers',
  'sacramento-kings',
  'san-antonio-spurs',
  'toronto-raptors',
  'utah-jazz',
  'washington-wizards',
] as const;

const POSITION_BY_LIST_SLUG: Record<string, Position> = {
  'point-guard': 'PG',
  'shooting-guard': 'SG',
  'small-forward': 'SF',
  'power-forward': 'PF',
  center: 'C',
};

// Guard thresholds: refuse to overwrite the dataset if a site redesign or
// partial outage produces an implausibly small scrape.
const MIN_TEAMS = 30;
const MIN_TOTAL_PLAYERS = 300;
const MIN_PLAYERS_PER_TEAM = 8;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const execFileAsync = promisify(execFile);

function clampRating(n: number): number {
  return Math.min(99, Math.max(40, n));
}

/**
 * Fetch via the system curl binary: the site's CDN rejects Node's fetch by
 * TLS fingerprint (403) but accepts curl. curl ships with Windows 10+ and
 * all GitHub Actions runners.
 */
async function fetchHtml(url: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'curl',
    ['-sS', '--fail', '--max-time', '30', '-A', USER_AGENT, url],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout;
}

async function fetchTeam(slug: string): Promise<RealTeamRecord> {
  const url = `https://www.2kratings.com/teams/${slug}`;
  const $ = load(await fetchHtml(url));

  const teamName = $('h1').first().text().trim();
  if (!teamName) throw new Error(`${slug}: could not find team name (h1)`);

  const players: RealPlayerRecord[] = [];
  $('table#lists-table').first().find('tbody tr').each((_, row) => {
    const $row = $(row);
    const name = $row.find('a.player-name').first().text().trim();
    if (!name) return; // decorative/placeholder rows

    // Primary position = first position-list link in the row's subtext.
    let position: Position | undefined;
    $row.find('a[href*="/lists/"]').each((_, link) => {
      if (position) return;
      const match = /\/lists\/([a-z-]+)/.exec($(link).attr('href') ?? '');
      const mapped = match ? POSITION_BY_LIST_SLUG[match[1]] : undefined;
      if (mapped) position = mapped;
    });
    if (!position) return;

    const overall = Number.parseInt($row.find('td').eq(2).attr('data-sort') ?? '', 10);
    if (!Number.isFinite(overall) || overall < 40 || overall > 99) return;

    const threePoint = Number.parseInt($row.attr('data-shot-3pt') ?? '', 10);
    const dunk = Number.parseInt($row.attr('data-driving-dunk') ?? '', 10);

    players.push({
      name,
      position,
      overall,
      threePoint: Number.isFinite(threePoint) ? clampRating(threePoint) : 50,
      dunk: Number.isFinite(dunk) ? clampRating(dunk) : 50,
    });
  });

  if (players.length < MIN_PLAYERS_PER_TEAM) {
    throw new Error(`${slug}: only parsed ${players.length} players — page layout may have changed`);
  }
  return { name: teamName, players };
}

async function main(): Promise<void> {
  const teams: RealTeamRecord[] = [];
  for (const slug of TEAM_SLUGS) {
    const team = await fetchTeam(slug);
    teams.push(team);
    console.log(`  ${team.name}: ${team.players.length} players`);
    await delay(300);
  }

  const totalPlayers = teams.reduce((sum, t) => sum + t.players.length, 0);
  if (teams.length < MIN_TEAMS || totalPlayers < MIN_TOTAL_PLAYERS) {
    throw new Error(
      `Scrape looks incomplete (${teams.length} teams, ${totalPlayers} players) — not writing`,
    );
  }

  const dataset: NbaDataset = {
    fetchedAt: new Date().toISOString().slice(0, 10),
    source: 'https://www.2kratings.com',
    teams,
  };

  const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'nba-players.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(dataset, null, 2)}\n`);
  console.log(`Wrote ${totalPlayers} players on ${teams.length} teams to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
