import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventCard } from '@perfect-season/shared';
import { validateEventCards } from './events';

/**
 * Guards the authored content in data/: every event card must match the
 * schema so AI-generated or hand-edited cards can't silently break runs.
 */

const cards: EventCard[] = JSON.parse(
  readFileSync(join(__dirname, '../../../data/event-cards.json'), 'utf-8'),
);

describe('data/event-cards.json', () => {
  it('contains a non-trivial card pool', () => {
    expect(cards.length).toBeGreaterThanOrEqual(10);
  });

  it('every card passes schema validation', () => {
    expect(validateEventCards(cards)).toEqual([]);
  });

  it('every card offers a real decision (choices differ in effects)', () => {
    for (const card of cards) {
      const signatures = card.choices.map((c) => JSON.stringify(c.effects));
      expect(new Set(signatures).size).toBeGreaterThan(1);
    }
  });
});
