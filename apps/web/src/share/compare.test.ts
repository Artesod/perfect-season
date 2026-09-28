import { describe, expect, it } from 'vitest';
import { compareResults, outcomeLabel } from './compare';

describe('compareResults', () => {
  it('ranks any win above any loss', () => {
    expect(
      compareResults(
        { wins: 75, losses: 7, result: 'won' },
        { wins: 81, losses: 1, result: 'lost' },
      ),
    ).toBe('beat');
    expect(
      compareResults(
        { wins: 81, losses: 1, result: 'lost' },
        { wins: 75, losses: 7, result: 'won' },
      ),
    ).toBe('fell-short');
  });
  it('ranks wins by fewer losses', () => {
    expect(
      compareResults(
        { wins: 80, losses: 2, result: 'won' },
        { wins: 79, losses: 3, result: 'won' },
      ),
    ).toBe('beat');
    expect(
      compareResults(
        { wins: 79, losses: 3, result: 'won' },
        { wins: 82, losses: 0, result: 'won' },
      ),
    ).toBe('fell-short');
  });
  it('ranks losses by more wins', () => {
    expect(
      compareResults(
        { wins: 60, losses: 3, result: 'lost' },
        { wins: 47, losses: 3, result: 'lost' },
      ),
    ).toBe('beat');
  });
  it('reports ties', () => {
    expect(
      compareResults(
        { wins: 47, losses: 3, result: 'lost' },
        { wins: 47, losses: 3, result: 'lost' },
      ),
    ).toBe('tied');
    expect(
      compareResults(
        { wins: 82, losses: 0, result: 'won' },
        { wins: 82, losses: 0, result: 'won' },
      ),
    ).toBe('tied');
  });
});

describe('outcomeLabel', () => {
  it('reads naturally', () => {
    expect(outcomeLabel('beat')).toBe('challenge beaten');
    expect(outcomeLabel('tied')).toBe('tied the challenger');
    expect(outcomeLabel('fell-short')).toBe('fell short');
  });
});
