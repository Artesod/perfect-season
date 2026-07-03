/**
 * Deterministic seeded RNG (mulberry32). Every run has a seed so the same
 * seed + same choices always produce the same outcomes (replays, tests,
 * shareable runs).
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [min, max] inclusive */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick a random element from a non-empty array */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * Derive an independent child seed from a run seed and a stream id (e.g. one
 * stream per game). Keeps every subsystem deterministic regardless of how
 * many random draws other subsystems consumed.
 */
export function deriveSeed(seed: number, stream: number): number {
  let h = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Fisher-Yates shuffle into a new array */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
