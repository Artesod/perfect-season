import { describe, expect, it } from 'vitest';
import { TOURS, tourForStatus } from './tours';

describe('tours', () => {
  it('maps run status to the screen tour', () => {
    expect(tourForStatus(null)).toBe('home');
    expect(tourForStatus('drafting')).toBe('draft');
    expect(tourForStatus('in-season')).toBe('season');
    expect(tourForStatus('playoffs')).toBe('season');
    expect(tourForStatus('won')).toBeNull();
    expect(tourForStatus('lost')).toBeNull();
  });

  it('gives every step a unique target, a title, and a body', () => {
    for (const [id, steps] of Object.entries(TOURS)) {
      expect(steps.length, id).toBeGreaterThan(0);
      const targets = steps.map((s) => s.target);
      expect(new Set(targets).size, id).toBe(targets.length);
      for (const step of steps) {
        expect(step.target.startsWith(`${id}-`), step.target).toBe(true);
        expect(step.title.trim()).not.toBe('');
        expect(step.body.trim()).not.toBe('');
      }
    }
  });
});
