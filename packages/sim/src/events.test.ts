import { describe, expect, it } from 'vitest';
import { createRng, type EventCard } from '@perfect-season/shared';
import {
  applyEvent,
  availableRoster,
  BASE_EVENT_CHANCES,
  emptyActiveEffects,
  resolveCardChoice,
  rollEvents,
  scaleChances,
  tickEffects,
  validateEventCards,
} from './events';
import { generateRoster } from './league';

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
    const a = rollEvents(roster, createRng(2), BASE_EVENT_CHANCES, [CARD]);
    const b = rollEvents(roster, createRng(2), BASE_EVENT_CHANCES, [CARD]);
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
      base += rollEvents(roster, rng, BASE_EVENT_CHANCES).length;
      scaled += rollEvents(roster, rng, doubled).length;
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
