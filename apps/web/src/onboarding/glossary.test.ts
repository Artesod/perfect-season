import { describe, expect, it } from 'vitest';
import { GLOSSARY, searchGlossary, type TermId } from './glossary';

const ALL_IDS = Object.keys(GLOSSARY) as TermId[];

describe('glossary', () => {
  it('gives every term a label and a short definition', () => {
    for (const id of ALL_IDS) {
      expect(GLOSSARY[id].label.trim(), id).not.toBe('');
      expect(GLOSSARY[id].short.trim(), id).not.toBe('');
    }
  });

  it('returns every term, sorted by label, for a blank query', () => {
    const result = searchGlossary('   ');
    expect(result).toHaveLength(ALL_IDS.length);
    const labels = result.map((id) => GLOSSARY[id].label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it('matches labels case-insensitively', () => {
    expect(searchGlossary('PWAR')).toContain('pwar');
  });

  it('matches words inside definitions', () => {
    expect(searchGlossary('wins above replacement')).toEqual(['pwar']);
  });

  it('finds every cap term for "cap"', () => {
    const result = searchGlossary('cap');
    for (const id of ['salary-cap', 'effective-cap', 'cap-space', 'dead-cap'] as const) {
      expect(result).toContain(id);
    }
  });

  it('returns nothing when no term matches', () => {
    expect(searchGlossary('zzzz-no-such-term')).toEqual([]);
  });
});
