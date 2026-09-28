import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunState, SeasonState } from '@perfect-season/shared';

vi.mock('../cloud', () => ({ syncFinishedRun: vi.fn() }));
vi.mock('../share/renderCard', () => ({ renderCard: vi.fn(async () => null) }));

import { useGameStore } from '../store';
import { RunSummaryScreen } from './RunSummaryScreen';

const season = { results: [], events: [], deadCap: 0 } as unknown as SeasonState;
const run = {
  seed: 48213,
  ascension: 2,
  casual: false,
  livesRemaining: 0,
  league: [],
  draft: null,
  roster: [],
  season,
  wins: 75,
  losses: 7,
  status: 'lost',
} as RunState;

beforeEach(() => useGameStore.setState({ run, runPool: null, newBadges: [] }));

describe('RunSummaryScreen sharing', () => {
  it('opens the share panel', async () => {
    render(<RunSummaryScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Share run' }));
    expect(screen.getByRole('dialog', { name: 'Share your run' })).toBeInTheDocument();
  });

  it('compares a challenge run with the challenger', () => {
    useGameStore.setState({
      run: { ...run, challenge: { wins: 71, losses: 11, result: 'lost' }, unranked: true },
    });
    render(<RunSummaryScreen />);
    expect(
      screen.getByText('You 75–7 vs challenger 71–11 — challenge beaten · unranked'),
    ).toBeInTheDocument();
  });

  it('shows no comparison for a normal run', () => {
    render(<RunSummaryScreen />);
    expect(screen.queryByText(/vs challenger/)).toBeNull();
  });
});
