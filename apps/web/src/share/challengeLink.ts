import type { PoolMode } from '@perfect-season/shared';
import { MAX_ASCENSION, runLives } from '@perfect-season/sim';

export type PoolChoice = PoolMode | 'procedural';

const POOLS: readonly PoolChoice[] = ['current', 'classic', 'all-time', 'mixed', 'procedural'];

/** Regular-season length; a won run has played every game */
const SEASON_GAMES = 82;

/** A shared run: enough to replay it and to show the sharer's result */
export interface ChallengeParams {
  seed: number;
  ascension: number;
  pool: PoolChoice;
  casual: boolean;
  wins: number;
  losses: number;
  result: 'won' | 'lost';
  /** Dataset version the sharer played on; null for procedural runs */
  datasetVersion: string | null;
}

/** Query keys a challenge link owns; stripped from the URL after reading */
export const CHALLENGE_KEYS: readonly string[] = [
  'c',
  'seed',
  'asc',
  'pool',
  'casual',
  'w',
  'l',
  'r',
  'v',
];

export function encodeChallenge(params: ChallengeParams, baseUrl: string): string {
  const query = new URLSearchParams({
    c: '1',
    seed: String(params.seed),
    asc: String(params.ascension),
    pool: params.pool,
    casual: params.casual ? '1' : '0',
    w: String(params.wins),
    l: String(params.losses),
    r: params.result,
  });
  if (params.pool !== 'procedural' && params.datasetVersion) query.set('v', params.datasetVersion);
  return `${baseUrl}?${query.toString()}`;
}

/** Plain non-negative integer, digits only (no signs, exponents, or decimals) */
function parseCount(value: string | null): number | null {
  if (value === null || !/^\d{1,15}$/.test(value)) return null;
  return Number(value);
}

/** Seeds may be negative: the Home screen accepts any integer the sim can hash */
function parseSeed(value: string | null): number | null {
  if (value === null || !/^-?\d{1,16}$/.test(value)) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) ? seed : null;
}

function isPoolChoice(value: string | null): value is PoolChoice {
  return POOLS.includes(value as PoolChoice);
}

/** Read a challenge from a query string; null when absent or invalid */
export function decodeChallenge(search: string): ChallengeParams | null {
  const query = new URLSearchParams(search);
  if (query.get('c') !== '1') return null;

  const seed = parseSeed(query.get('seed'));
  const ascension = parseCount(query.get('asc'));
  const wins = parseCount(query.get('w'));
  const losses = parseCount(query.get('l'));
  const pool = query.get('pool');
  const casual = query.get('casual');
  const result = query.get('r');

  if (seed === null || ascension === null || wins === null || losses === null) return null;
  if (ascension > MAX_ASCENSION) return null;
  if (!isPoolChoice(pool)) return null;
  if (casual !== '0' && casual !== '1') return null;
  if (result !== 'won' && result !== 'lost') return null;
  const games = wins + losses;
  if (games > SEASON_GAMES || (result === 'won' && games !== SEASON_GAMES)) return null;
  // A lost run has spent its lives; a won run has some left
  const lives = runLives(ascension, casual === '1');
  if (result === 'lost' ? losses < 1 || losses > lives : losses >= lives) return null;

  return {
    seed,
    ascension,
    pool,
    casual: casual === '1',
    wins,
    losses,
    result,
    datasetVersion: pool === 'procedural' ? null : query.get('v') || null,
  };
}

/** Absolute URL of the app root, in dev and on GitHub Pages */
export function siteBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

/** Short printable site address for the card, e.g. "artesod.github.io/perfect-season" */
export function siteLabel(): string {
  const url = new URL(siteBaseUrl());
  return `${url.host}${url.pathname}`.replace(/\/$/, '');
}
