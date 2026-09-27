import type { Player } from '@perfect-season/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayerInfoModal } from './PlayerInfoModal';

const player = {
  id: 'p1',
  name: 'Test Player',
  position: 'PG',
  salary: 10,
  overall: 80,
  offense: 82,
  defense: 78,
  pWAR: 5.4,
  traits: [],
  stats: {
    season: '2025-26',
    points: 20,
    rebounds: 5,
    assists: 7,
    steals: 1,
    blocks: 0.5,
    minutes: 34,
    fgPct: 0.48,
    threePct: 0.38,
    gamesPlayed: 70,
  },
} as unknown as Player;

describe('PlayerInfoModal terms', () => {
  it('explains ratings and stat abbreviations inline', () => {
    render(<PlayerInfoModal player={player} onClose={() => {}} />);
    for (const label of ['pWAR', 'Overall', 'Offense', 'Defense', 'PPG', 'RPG', 'APG', 'SPG', 'BPG', 'MPG', 'FG%', '3P%', 'GP']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass('term-trigger');
    }
  });
});
