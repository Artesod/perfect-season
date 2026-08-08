import {
  pick,
  POSITIONS,
  randInt,
  type Player,
  type Position,
  type Rng,
  type Team,
} from '@perfect-season/shared';

/**
 * Procedural player and CPU-league generation. Everything flows from the run
 * seed, so the same seed always produces the same league and draft pool.
 * If we later source real NBA data into data/, it can replace or augment
 * this generator behind the same interfaces.
 */

const FIRST_NAMES = [
  'Jalen',
  'Marcus',
  'Darius',
  'Trey',
  'Isaiah',
  'Zion',
  'Devin',
  'Malik',
  'Andre',
  'Chris',
  'Jordan',
  'Tyler',
  'Kevin',
  'Anthony',
  'Josh',
  'Cam',
  'DeMar',
  'Kyrie',
  'Luka',
  'Nikola',
  'Giannis',
  'Victor',
  'Paolo',
  'Scottie',
  'Jaylen',
  'Jamal',
  'Shai',
  'Trae',
  'Ja',
  'Desmond',
  'Franz',
  'Evan',
] as const;

const LAST_NAMES = [
  'Williams',
  'Johnson',
  'Smith',
  'Brown',
  'Jones',
  'Davis',
  'Miller',
  'Wilson',
  'Moore',
  'Taylor',
  'Anderson',
  'Thomas',
  'Jackson',
  'White',
  'Harris',
  'Martin',
  'Thompson',
  'Young',
  'Walker',
  'Hall',
  'Allen',
  'King',
  'Wright',
  'Scott',
  'Green',
  'Baker',
  'Adams',
  'Nelson',
  'Carter',
  'Mitchell',
  'Turner',
  'Parker',
] as const;

const CITIES = [
  'Atlanta',
  'Boston',
  'Brooklyn',
  'Charlotte',
  'Chicago',
  'Cleveland',
  'Dallas',
  'Denver',
  'Detroit',
  'Golden State',
  'Houston',
  'Indiana',
  'LA',
  'Los Angeles',
  'Memphis',
  'Miami',
  'Milwaukee',
  'Minnesota',
  'New Orleans',
  'New York',
  'Oklahoma City',
  'Orlando',
  'Philadelphia',
  'Phoenix',
  'Portland',
  'Sacramento',
  'San Antonio',
  'Toronto',
  'Utah',
  'Washington',
] as const;

const TRAITS_BY_POSITION: Record<Position, readonly string[]> = {
  PG: ['playmaker', 'sharpshooter', 'pest-defender', 'ball-dominant'],
  SG: ['sharpshooter', 'slasher', 'ball-dominant', 'catch-and-shoot'],
  SF: ['two-way', 'slasher', 'catch-and-shoot', 'point-forward'],
  PF: ['stretch-big', 'rebounder', 'post-scorer', 'lob-threat'],
  C: ['rim-protector', 'rebounder', 'lob-threat', 'stretch-big'],
};

const EVENT_TRAITS = ['iron-man', 'injury-prone', 'hot-head'] as const;

/** Salary in millions derived from overall, superstars get max-level deals. */
export function salaryForOverall(overall: number): number {
  if (overall >= 90) return 45 + (overall - 90) * 1.5;
  if (overall >= 80) return 20 + (overall - 80) * 2.5;
  if (overall >= 70) return 5 + (overall - 70) * 1.5;
  return 2;
}

/** Projected wins above replacement over a full season, derived from overall. */
export function pWarForOverall(overall: number): number {
  return Math.max(0, (overall - 68) * 0.45);
}

export interface GeneratePlayerOptions {
  position?: Position;
  /** Inclusive overall range; defaults to a league-wide 55-95 spread */
  minOverall?: number;
  maxOverall?: number;
}

export function generatePlayer(rng: Rng, options: GeneratePlayerOptions = {}): Player {
  const position = options.position ?? pick(rng, POSITIONS);
  const overall = randInt(rng, options.minOverall ?? 55, options.maxOverall ?? 95);
  // Skew off/def around the overall so players have a lean.
  const lean = randInt(rng, -6, 6);
  const offense = Math.min(99, Math.max(40, overall + lean));
  const defense = Math.min(99, Math.max(40, overall - lean));

  const traitPool = TRAITS_BY_POSITION[position];
  const traitCount = randInt(rng, 1, 2);
  const traits = [...new Set(Array.from({ length: traitCount }, () => pick(rng, traitPool)))];
  if (rng() < 0.1) traits.push(pick(rng, EVENT_TRAITS));

  // Id comes purely from the RNG stream so the same seed reproduces the
  // same league exactly. Two draws make collisions vanishingly unlikely.
  const id = `gen-${Math.floor(rng() * 0xffffffff).toString(36)}${Math.floor(rng() * 0xffffffff).toString(36)}`;
  return {
    id,
    name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    position,
    overall,
    offense,
    defense,
    salary: Math.round(salaryForOverall(overall) * 10) / 10,
    pWAR: Math.round(pWarForOverall(overall) * 10) / 10,
    traits,
  };
}

/** Roster with sensible position coverage: 3 per position = 15 players. */
export function generateRoster(rng: Rng, options: GeneratePlayerOptions = {}): Player[] {
  return POSITIONS.flatMap((position) =>
    Array.from({ length: 3 }, () => generatePlayer(rng, { ...options, position })),
  );
}

export interface GenerateLeagueOptions {
  /** Number of CPU teams; the NBA-shaped default is 29 (user team is the 30th) */
  teamCount?: number;
  /** Average team quality band; CPU rosters draw overalls from this range */
  minOverall?: number;
  maxOverall?: number;
}

export function generateLeague(rng: Rng, options: GenerateLeagueOptions = {}): Team[] {
  const teamCount = options.teamCount ?? 29;
  return Array.from({ length: teamCount }, (_, i) => {
    const city = CITIES[i % CITIES.length];
    return {
      id: `cpu-${i + 1}`,
      name: city,
      players: generateRoster(rng, {
        minOverall: options.minOverall ?? 55,
        maxOverall: options.maxOverall ?? 92,
      }),
    };
  });
}
