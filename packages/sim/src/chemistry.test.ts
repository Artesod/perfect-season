import { describe, expect, it } from 'vitest';
import type { Player } from '@perfect-season/shared';
import { chemistryDelta, computeChemistry } from './chemistry';

let counter = 0;
function makePlayer(traits: string[], eraTeam?: string): Player {
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
    ...(eraTeam ? { eraTeam } : {}),
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

  it('rewards teammates from the same era roster, scaling with the group', () => {
    const duo = computeChemistry([
      makePlayer([], '1995-96 Chicago Bulls'),
      makePlayer([], '1995-96 Chicago Bulls'),
      makePlayer([]),
    ]).find((e) => e.id === 'ran-it-back');
    expect(duo).toMatchObject({ strengthDelta: 1 });
    expect(duo!.playerIds).toHaveLength(2);

    const trio = computeChemistry([
      makePlayer([], '1995-96 Chicago Bulls'),
      makePlayer([], '1995-96 Chicago Bulls'),
      makePlayer([], '1995-96 Chicago Bulls'),
      makePlayer([]),
    ]).find((e) => e.id === 'ran-it-back');
    expect(trio).toMatchObject({ strengthDelta: 2 });
  });

  it('gives an intact era team no ran-it-back bonus (CPU teams stay baseline)', () => {
    const players = Array.from({ length: 10 }, () => makePlayer([], 'All-Time Lakers'));
    expect(computeChemistry(players).some((e) => e.id === 'ran-it-back')).toBe(false);
  });
});
