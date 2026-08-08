import { describe, expect, it } from 'vitest';
import type { Player } from '@perfect-season/shared';
import {
  chemistryDelta,
  cohesionAfterGame,
  cohesionAfterSigning,
  computeChemistry,
} from './chemistry';

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

const p = (over: Partial<Player>): Player => ({
  ...makePlayer(over.traits ?? []),
  ...over,
});

describe('cohesion scaling', () => {
  const cooks = [
    p({ id: 'a', traits: ['ball-dominant'] }),
    p({ id: 'b', traits: ['ball-dominant'] }),
    p({ id: 'c', traits: ['ball-dominant'] }),
    p({ id: 'd', traits: ['ball-dominant'] }),
  ];

  it('floors too-many-cooks at -3 and fades it with cohesion', () => {
    const fresh = computeChemistry(cooks, 0).find((e) => e.id === 'too-many-cooks')!;
    expect(fresh.strengthDelta).toBe(-3);
    expect(fresh.kind).toBe('friction');
    const half = computeChemistry(cooks, 0.5).find((e) => e.id === 'too-many-cooks')!;
    expect(half.strengthDelta).toBe(-1.5);
  });

  it('flips too-many-cooks into pecking-order once resolved', () => {
    const effects = computeChemistry(cooks, 0.95);
    expect(effects.some((e) => e.id === 'too-many-cooks')).toBe(false);
    const resolved = effects.find((e) => e.id === 'pecking-order')!;
    expect(resolved.strengthDelta).toBe(1);
  });

  it('deepens synergies and leaves structural rules alone', () => {
    const roster = [
      p({ traits: ['playmaker'] }),
      p({ traits: ['catch-and-shoot'] }),
      p({ traits: ['catch-and-shoot'] }),
    ];
    const fg0 = computeChemistry(roster, 0).find((e) => e.id === 'floor-general')!;
    const fg1 = computeChemistry(roster, 1).find((e) => e.id === 'floor-general')!;
    expect(fg1.strengthDelta).toBeCloseTo(fg0.strengthDelta * 1.25, 5);

    const bricks = Array.from({ length: 8 }, (_, i) => p({ id: `b${i}`, traits: [] }));
    const ns0 = computeChemistry(bricks, 0).find((e) => e.id === 'no-spacing')!;
    const ns1 = computeChemistry(bricks, 1).find((e) => e.id === 'no-spacing')!;
    expect(ns1.strengthDelta).toBe(ns0.strengthDelta);
  });
});

describe('cohesion progression', () => {
  it('wins gel faster than losses; clamped at 1', () => {
    expect(cohesionAfterGame(0, true)).toBeCloseTo(1 / 35);
    expect(cohesionAfterGame(0, false)).toBeCloseTo(0.4 / 35);
    expect(cohesionAfterGame(0.999, true)).toBe(1);
  });
  it('signings knock off 20%', () => {
    expect(cohesionAfterSigning(0.5)).toBeCloseTo(0.4);
  });
});

describe('new rules', () => {
  it('lob-city: playmaker plus finisher', () => {
    const roster = [p({ traits: ['playmaker'] }), p({ traits: ['lob-threat'], position: 'C' })];
    expect(computeChemistry(roster, 0).some((e) => e.id === 'lob-city')).toBe(true);
  });
  it('switchable: three defensive wings', () => {
    const roster = [
      p({ position: 'SG', traits: ['pest-defender'] }),
      p({ position: 'SF', traits: ['two-way'] }),
      p({ position: 'PF', traits: ['two-way'] }),
    ];
    expect(computeChemistry(roster, 0).some((e) => e.id === 'switchable')).toBe(true);
  });
  it('bench-mob: strong 6th-9th men', () => {
    const roster = Array.from({ length: 10 }, (_, i) =>
      p({ id: `r${i}`, overall: i < 5 ? 90 : 80, traits: ['sharpshooter'] }),
    );
    expect(computeChemistry(roster, 0).some((e) => e.id === 'bench-mob')).toBe(true);
  });
  it('one-way-team: offense far ahead of defense', () => {
    const roster = Array.from({ length: 8 }, (_, i) =>
      p({ id: `o${i}`, offense: 90, defense: 78, traits: ['sharpshooter'] }),
    );
    const effect = computeChemistry(roster, 0).find((e) => e.id === 'one-way-team')!;
    expect(effect.kind).toBe('structural');
  });
  it('clogged-paint: three non-shooting bigs', () => {
    const roster = [
      p({ position: 'C', traits: ['rim-protector'] }),
      p({ position: 'C', traits: ['rebounder'] }),
      p({ position: 'PF', traits: ['post-scorer'] }),
      p({ position: 'SG', traits: ['sharpshooter'] }),
      p({ position: 'SG', traits: ['sharpshooter'] }),
      p({ position: 'SF', traits: ['sharpshooter'] }),
    ];
    expect(computeChemistry(roster, 0).some((e) => e.id === 'clogged-paint')).toBe(true);
  });
});
