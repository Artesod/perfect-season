import { describe, expect, it } from 'vitest';
import type { Player } from '@perfect-season/shared';
import { chemistryDelta, computeChemistry } from './chemistry';

let counter = 0;
function makePlayer(traits: string[]): Player {
  counter++;
  return {
    id: `p${counter}`,
    name: `Player ${counter}`,
    position: 'SF',
    overall: 80,
    offense: 80,
    defense: 80,
    salary: 10,
    pWAR: 4,
    traits,
  };
}

describe('computeChemistry', () => {
  it('finds the floor-general synergy', () => {
    const players = [
      makePlayer(['playmaker']),
      makePlayer(['catch-and-shoot']),
      makePlayer(['sharpshooter']),
    ];
    const effects = computeChemistry(players);
    expect(effects.some((e) => e.id === 'floor-general')).toBe(true);
  });

  it('penalizes multiple ball-dominant players, scaling with count', () => {
    const two = computeChemistry([
      makePlayer(['ball-dominant', 'sharpshooter']),
      makePlayer(['ball-dominant', 'catch-and-shoot']),
      makePlayer(['sharpshooter']),
    ]).find((e) => e.id === 'too-many-cooks');
    const three = computeChemistry([
      makePlayer(['ball-dominant', 'sharpshooter']),
      makePlayer(['ball-dominant', 'catch-and-shoot']),
      makePlayer(['ball-dominant', 'sharpshooter']),
    ]).find((e) => e.id === 'too-many-cooks');
    expect(two).toBeDefined();
    expect(three).toBeDefined();
    expect(three!.strengthDelta).toBeLessThan(two!.strengthDelta);
  });

  it('flags no-spacing and matador-defense on trait-poor full rosters', () => {
    const players = Array.from({ length: 10 }, () => makePlayer(['post-scorer']));
    const effects = computeChemistry(players);
    expect(effects.some((e) => e.id === 'no-spacing')).toBe(true);
    expect(effects.some((e) => e.id === 'matador-defense')).toBe(true);
    expect(chemistryDelta(players)).toBeLessThan(0);
  });

  it('produces no effects for a trait-less roster', () => {
    const players = Array.from({ length: 5 }, () => makePlayer([]));
    expect(computeChemistry(players)).toEqual([]);
    expect(chemistryDelta(players)).toBe(0);
  });
});
