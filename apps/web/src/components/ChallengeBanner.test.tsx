import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyMetaProgress } from '@perfect-season/sim';

vi.mock('../cloud', () => ({ syncFinishedRun: vi.fn() }));
vi.mock('../nbaData', () => ({
  poolForMode: (mode: string) =>
    mode === 'current' ? { mode: 'current', nba: { fetchedAt: '2026-09-20' } } : null,
}));

import type { ChallengeParams } from '../share/challengeLink';
import { useGameStore } from '../store';
import { ChallengeBanner } from './ChallengeBanner';

const challenge: ChallengeParams = {
  seed: 48213,
  ascension: 0,
  pool: 'current',
  casual: false,
  wins: 71,
  losses: 11,
  result: 'lost',
  datasetVersion: '2026-09-20',
};

const newRun = vi.fn();

beforeEach(() => {
  newRun.mockReset();
  useGameStore.setState({ challenge, meta: emptyMetaProgress(), newRun });
});

describe('ChallengeBanner', () => {
  it('renders nothing without a challenge', () => {
    useGameStore.setState({ challenge: null });
    const { container } = render(<ChallengeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the target and setup', () => {
    render(<ChallengeBanner />);
    expect(screen.getByRole('heading', { name: 'Beat 71–11' })).toBeInTheDocument();
    expect(screen.getByText('Asc 0 · Current NBA · seed 48213')).toBeInTheDocument();
    expect(screen.queryByText(/Unranked/)).toBeNull();
    expect(screen.queryByText(/Rosters updated/)).toBeNull();
  });

  it('starts the exact challenge run', async () => {
    render(<ChallengeBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Start challenge' }));
    expect(newRun).toHaveBeenCalledWith(
      48213,
      0,
      { mode: 'current', nba: { fetchedAt: '2026-09-20' } },
      false,
      { challenge: { wins: 71, losses: 11, result: 'lost' } },
    );
  });

  it('warns when the ascension is locked', () => {
    useGameStore.setState({ challenge: { ...challenge, ascension: 3 } });
    render(<ChallengeBanner />);
    expect(screen.getByText(/Unranked — Asc 3 not unlocked/)).toBeInTheDocument();
  });

  it('warns when rosters changed since the run', () => {
    useGameStore.setState({ challenge: { ...challenge, datasetVersion: '2026-01-01' } });
    render(<ChallengeBanner />);
    expect(
      screen.getByText('Rosters updated since this run — results may differ.'),
    ).toBeInTheDocument();
  });

  it('disables Start when the pool is not in this build', () => {
    useGameStore.setState({ challenge: { ...challenge, pool: 'classic' } });
    render(<ChallengeBanner />);
    expect(screen.getByText("This pool isn't available in this build.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start challenge' })).toBeDisabled();
  });

  it('dismisses', async () => {
    render(<ChallengeBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(useGameStore.getState().challenge).toBeNull();
  });
});
