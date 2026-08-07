/**
 * Ascension-style difficulty. Level 0 is the base game; each level layers on
 * more pressure. Beating level N unlocks level N+1 (see meta.ts).
 */

export interface DifficultyModifiers {
  /** Added to CPU roster generation quality ceiling and floor */
  cpuOverallBonus: number;
  /** Multiplies all between-game event chances (injuries included) */
  eventChanceMultiplier: number;
  /** Millions removed from the effective salary cap during drafting/signing */
  capReduction: number;
  /** Losses allowed before the run ends */
  lives: number;
}

// Lives are flat at 3 for now; dropping them (3 → 2 → 1) is a future
// ascension lever once the other modifiers are tuned.
export const ASCENSIONS: readonly DifficultyModifiers[] = [
  { cpuOverallBonus: 0, eventChanceMultiplier: 1, capReduction: 0, lives: 3 },
  { cpuOverallBonus: 1, eventChanceMultiplier: 1.2, capReduction: 0, lives: 3 },
  { cpuOverallBonus: 2, eventChanceMultiplier: 1.4, capReduction: 10, lives: 3 },
  { cpuOverallBonus: 3, eventChanceMultiplier: 1.6, capReduction: 15, lives: 3 },
  { cpuOverallBonus: 4, eventChanceMultiplier: 1.8, capReduction: 20, lives: 3 },
  { cpuOverallBonus: 5, eventChanceMultiplier: 2, capReduction: 25, lives: 3 },
];

export const MAX_ASCENSION = ASCENSIONS.length - 1;

export function difficultyFor(ascension: number): DifficultyModifiers {
  if (ascension < 0 || ascension > MAX_ASCENSION) {
    throw new Error(`Ascension must be between 0 and ${MAX_ASCENSION}`);
  }
  return ASCENSIONS[ascension];
}
