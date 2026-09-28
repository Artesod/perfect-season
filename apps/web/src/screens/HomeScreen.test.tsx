import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyMetaProgress } from '@perfect-season/sim';

vi.mock('../cloud', () => ({ syncFinishedRun: vi.fn() }));
vi.mock('../components/LeaderboardPanel', () => ({ LeaderboardPanel: () => null }));
vi.mock('../onboarding/runTour', () => ({ runTour: vi.fn(() => true), stopTour: vi.fn() }));

import { useOnboardingStore } from '../onboarding/onboardingStore';
import { runTour } from '../onboarding/runTour';
import type { ChallengeParams } from '../share/challengeLink';
import { useGameStore } from '../store';
import { HomeScreen } from './HomeScreen';

const challenge: ChallengeParams = {
  seed: 48213,
  ascension: 0,
  pool: 'procedural',
  casual: false,
  wins: 71,
  losses: 3,
  result: 'lost',
  datasetVersion: null,
};

const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
};

beforeEach(() => {
  vi.mocked(runTour).mockClear();
  useOnboardingStore.setState({ seen: {}, skipAll: false });
  useGameStore.setState({ run: null, meta: emptyMetaProgress(), challenge: null });
});

describe('HomeScreen with a challenge', () => {
  it('holds the first-visit tour so it does not cover the challenge', async () => {
    useGameStore.setState({ challenge });
    render(<HomeScreen />);
    expect(screen.getByRole('region', { name: 'Challenge' })).toBeInTheDocument();
    await frames(3);
    expect(runTour).not.toHaveBeenCalled();
  });

  it('still runs the tour on a normal first visit', async () => {
    render(<HomeScreen />);
    await frames(3);
    expect(runTour).toHaveBeenCalledWith('home');
  });

  it('prefills the seed from the challenge', () => {
    useGameStore.setState({ challenge });
    render(<HomeScreen />);
    expect(screen.getByLabelText('Run seed')).toHaveValue('48213');
  });
});
