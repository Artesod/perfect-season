import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpMenu } from './HelpMenu';
import { useOnboardingStore } from './onboardingStore';
import { runTour } from './runTour';

vi.mock('./runTour', () => ({ runTour: vi.fn(() => true), stopTour: vi.fn() }));

beforeEach(() => {
  vi.mocked(runTour).mockClear();
  useOnboardingStore.setState({
    seen: {},
    skipAll: false,
    glossaryOpen: false,
    glossaryFocus: null,
  });
});

const openMenu = () => userEvent.click(screen.getByRole('button', { name: 'Help' }));

describe('HelpMenu', () => {
  it('replays the current screen tour', async () => {
    render(<HelpMenu tourId="draft" />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Tour this screen' }));
    expect(runTour).toHaveBeenCalledWith('draft');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('hides the tour item on screens without a tour', async () => {
    render(<HelpMenu tourId={null} />);
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Tour this screen' })).not.toBeInTheDocument();
  });

  it('opens the glossary', async () => {
    render(<HelpMenu tourId="home" />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Glossary' }));
    expect(useOnboardingStore.getState().glossaryOpen).toBe(true);
  });

  it('resets every tour', async () => {
    useOnboardingStore.setState({ seen: { home: true, draft: true }, skipAll: true });
    render(<HelpMenu tourId="home" />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reset all tours' }));
    expect(useOnboardingStore.getState()).toMatchObject({ seen: {}, skipAll: false });
  });

  it('closes on Escape and on an outside click', async () => {
    render(
      <>
        <HelpMenu tourId="home" />
        <p>outside</p>
      </>,
    );
    await openMenu();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await openMenu();
    await userEvent.click(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
