import { describe, expect, it } from 'vitest';
import { createRng, type EventCard, type Player } from '@perfect-season/shared';
import {
  applyEvent,
  type EventChances,
  availableRoster,
  BASE_EVENT_CHANCES,
  emptyActiveEffects,
  resolveCardChoice,
  resolveNagging,
  rollEvents,
  scaleChances,
  tickEffects,
  validateEventCards,
} from './events';
import { generateRoster } from './league';

let playerCounter = 0;
function player(over: Partial<Player> = {}): Player {
  playerCounter++;
  return {
    id: `ep${playerCounter}`,
    name: `Event Player ${playerCounter}`,
    position: 'SF',
    overall: 80,
    offense: 80,
    defense: 80,
    salary: 10,
    pWAR: 4,
    traits: [],
    ...over,
  };
}

const ZERO_CHANCES: EventChances = {
  injury: 0,
  illness: 0,
  suspension: 0,
  nagging: 0,
  hotStreak: 0,
  slump: 0,
  morale: 0,
};

const CARD: EventCard = {
  id: 'test-card',
  title: 'Test Card',
  text: 'Something happened to {player}.',
  choices: [
    {
      id: 'good',
      label: 'Good choice',
      effects: [{ type: 'rating', delta: 2, games: 3, target: 'involved' }],
    },
    {
      id: 'team-wide',
      label: 'Team choice',
      effects: [{ type: 'rating', delta: 1, games: 2, target: 'team' }],
    },
  ],
};

describe('rollEvents', () => {
  it('is deterministic for the same seed', () => {
    const roster = generateRoster(createRng(1));
    const a = rollEvents(roster, createRng(2), { cards: [CARD] });
    const b = rollEvents(roster, createRng(2), { cards: [CARD] });
    expect(a).toEqual(b);
  });

  it('fires events at plausible rates over many rolls', () => {
    const roster = generateRoster(createRng(3));
    const rng = createRng(4);
    let injuries = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      for (const e of rollEvents(roster, rng)) {
        if (e.type === 'injury') injuries++;
      }
    }
    const rate = injuries / trials;
    expect(rate).toBeGreaterThan(BASE_EVENT_CHANCES.injury * 0.6);
    expect(rate).toBeLessThan(BASE_EVENT_CHANCES.injury * 1.4);
  });

  it('scales with a difficulty multiplier', () => {
    const roster = generateRoster(createRng(5));
    const rng = createRng(6);
    let base = 0;
    let scaled = 0;
    const doubled = scaleChances(BASE_EVENT_CHANCES, 2);
    for (let i = 0; i < 2000; i++) {
      base += rollEvents(roster, rng, { chances: BASE_EVENT_CHANCES }).length;
      scaled += rollEvents(roster, rng, { chances: doubled }).length;
    }
    expect(scaled).toBeGreaterThan(base * 1.5);
  });

  it('never fires morale events without a card pool', () => {
    const roster = generateRoster(createRng(7));
    const rng = createRng(8);
    for (let i = 0; i < 500; i++) {
      expect(rollEvents(roster, rng).every((e) => e.type !== 'morale')).toBe(true);
    }
  });
});

describe('new event types', () => {
  it('illness and suspension sideline players via the absence map', () => {
    let effects = emptyActiveEffects();
    effects = applyEvent(effects, { type: 'illness', playerId: 'p1', gamesOut: 2 });
    effects = applyEvent(effects, { type: 'suspension', playerId: 'p2', gamesOut: 1 });
    expect(effects.injuries).toEqual({ p1: 2, p2: 1 });
  });

  it('revenge applies a one-game rating boost', () => {
    const effects = applyEvent(emptyActiveEffects(), {
      type: 'revenge',
      playerId: 'p1',
      ratingDelta: 2,
      gamesRemaining: 1,
    });
    expect(effects.ratingMods.p1).toEqual({ delta: 2, gamesRemaining: 1 });
  });

  it('nagging is inert until resolved', () => {
    const event = {
      type: 'nagging',
      playerId: 'p1',
      playHurtDelta: -3,
      playHurtGames: 6,
      sitGames: 2,
    } as const;
    expect(applyEvent(emptyActiveEffects(), event)).toEqual(emptyActiveEffects());
    const pending = { playerId: 'p1', playHurtDelta: -3, playHurtGames: 6, sitGames: 2 };
    expect(resolveNagging(emptyActiveEffects(), pending, 'play').ratingMods.p1).toEqual({
      delta: -3,
      gamesRemaining: 6,
    });
    expect(resolveNagging(emptyActiveEffects(), pending, 'sit').injuries.p1).toBe(2);
  });
});

describe('rollEvents context', () => {
  it('revenge only fires against a rostered player origin team', () => {
    const roster = [player({ id: 'rp1', originTeamId: 'cpu-3' }), player({ id: 'rp2' })];
    const fire = rollEvents(roster, () => 0.0001, {
      chances: ZERO_CHANCES,
      nextOpponentTeamId: 'cpu-3',
    });
    expect(fire.some((e) => e.type === 'revenge' && e.playerId === 'rp1')).toBe(true);
    const wrongTeam = rollEvents(roster, () => 0.0001, {
      chances: ZERO_CHANCES,
      nextOpponentTeamId: 'cpu-9',
    });
    expect(wrongTeam.some((e) => e.type === 'revenge')).toBe(false);
  });

  it('cards with requires only fire while the chemistry effect is active, targeting its producers best-first', () => {
    const card: EventCard = {
      id: 'gated',
      title: 'G',
      text: 't',
      requires: 'chemistry-effect:too-many-cooks',
      choices: [
        { id: 'a', label: 'A', effects: [{ type: 'none' }] },
        { id: 'b', label: 'B', effects: [{ type: 'cohesion', delta: 0.3 }] },
      ],
    };
    const roster = [
      player({ id: 'low', overall: 85 }),
      player({ id: 'high', overall: 95 }),
      player({ id: 'other' }),
    ];
    const chances = { ...ZERO_CHANCES, morale: 1 };
    const without = rollEvents(roster, () => 0.0001, { chances, cards: [card] });
    expect(without.some((e) => e.type === 'morale')).toBe(false);
    const withEffect = rollEvents(roster, () => 0.0001, {
      chances,
      cards: [card],
      chemistry: new Map([['too-many-cooks', ['low', 'high']]]),
    });
    const morale = withEffect.find((e) => e.type === 'morale')!;
    expect(morale).toBeDefined();
    expect(morale.type === 'morale' && morale.playerIds).toEqual(['high', 'low']);
  });

  it('weights injury targets by durability traits', () => {
    const roster = [
      player({ id: 'tank', traits: ['iron-man'] }),
      player({ id: 'glass', traits: ['injury-prone'] }),
    ];
    const chances = { ...ZERO_CHANCES, injury: 1 };
    let glassHits = 0;
    for (let seed = 0; seed < 200; seed++) {
      const events = rollEvents(roster, createRng(seed), { chances });
      if (events.some((e) => e.type === 'injury' && e.playerId === 'glass')) glassHits++;
    }
    expect(glassHits).toBeGreaterThan(120); // 4:1 weighting ≈ 80%
  });
});

describe('active effects lifecycle', () => {
  it('injury sidelines a player until it ticks down', () => {
    const roster = generateRoster(createRng(9));
    const victim = roster[0];
    let effects = applyEvent(emptyActiveEffects(), {
      type: 'injury',
      playerId: victim.id,
      severity: 'minor',
      gamesOut: 2,
    });
    expect(availableRoster(roster, effects).find((p) => p.id === victim.id)).toBeUndefined();
    effects = tickEffects(effects);
    expect(availableRoster(roster, effects).find((p) => p.id === victim.id)).toBeUndefined();
    effects = tickEffects(effects);
    expect(availableRoster(roster, effects).find((p) => p.id === victim.id)).toBeDefined();
  });

  it('hot streak boosts ratings while active, then fades', () => {
    const roster = generateRoster(createRng(10), { minOverall: 70, maxOverall: 80 });
    const star = roster[0];
    let effects = applyEvent(emptyActiveEffects(), {
      type: 'hot-streak',
      playerId: star.id,
      ratingDelta: 4,
      gamesRemaining: 1,
    });
    const boosted = availableRoster(roster, effects).find((p) => p.id === star.id)!;
    expect(boosted.overall).toBe(Math.min(99, star.overall + 4));
    effects = tickEffects(effects);
    const after = availableRoster(roster, effects).find((p) => p.id === star.id)!;
    expect(after.overall).toBe(star.overall);
  });

  it('card choices apply to involved players or the whole team', () => {
    const roster = generateRoster(createRng(11));
    const involved = [roster[0].id];
    const all = roster.map((p) => p.id);

    const single = resolveCardChoice(emptyActiveEffects(), CARD, 'good', involved, all);
    expect(Object.keys(single.ratingMods)).toEqual(involved);

    const teamWide = resolveCardChoice(emptyActiveEffects(), CARD, 'team-wide', involved, all);
    expect(Object.keys(teamWide.ratingMods)).toHaveLength(roster.length);

    expect(() => resolveCardChoice(emptyActiveEffects(), CARD, 'nope', involved, all)).toThrow();
  });
});

describe('validateEventCards', () => {
  it('accepts a well-formed card', () => {
    expect(validateEventCards([CARD])).toEqual([]);
  });

  it('rejects duplicates, missing choices, and bad effects', () => {
    const bad = [
      CARD,
      { ...CARD },
      { ...CARD, id: 'one-choice', choices: [CARD.choices[0]] },
      {
        ...CARD,
        id: 'zero-delta',
        choices: [
          {
            id: 'a',
            label: 'A',
            effects: [{ type: 'rating', delta: 0, games: 0, target: 'involved' as const }],
          },
          { id: 'b', label: 'B', effects: [{ type: 'none' as const }] },
        ],
      },
    ] as EventCard[];
    const errors = validateEventCards(bad);
    expect(errors.some((e) => e.includes('Duplicate card id'))).toBe(true);
    expect(errors.some((e) => e.includes('at least 2 choices'))).toBe(true);
    expect(errors.some((e) => e.includes('delta of 0'))).toBe(true);
    expect(errors.some((e) => e.includes('games must be >= 1'))).toBe(true);
  });
});
