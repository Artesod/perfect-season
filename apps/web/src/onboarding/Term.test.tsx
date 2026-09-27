import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GLOSSARY } from './glossary';
import { useOnboardingStore } from './onboardingStore';
import { Term } from './Term';

beforeEach(() => {
  useOnboardingStore.setState({ glossaryOpen: false, glossaryFocus: null });
});

describe('Term', () => {
  it('shows the children and hides the definition until asked', () => {
    render(<Term id="pwar">pWAR</Term>);
    expect(screen.getByRole('button', { name: 'pWAR' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('falls back to the glossary label when no children are given', () => {
    render(<Term id="dead-cap" />);
    expect(screen.getByRole('button', { name: 'Dead cap' })).toBeInTheDocument();
  });

  it('opens on tap and shows the short definition', async () => {
    render(<Term id="pwar">pWAR</Term>);
    await userEvent.click(screen.getByRole('button', { name: 'pWAR' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(GLOSSARY.pwar.short);
  });

  it('opens on keyboard focus and closes on Escape', async () => {
    render(<Term id="lives">Lives</Term>);
    await userEvent.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens on hover and closes when the pointer leaves', async () => {
    render(<Term id="ovr">OVR</Term>);
    await userEvent.hover(screen.getByRole('button', { name: 'OVR' }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await userEvent.unhover(screen.getByRole('button', { name: 'OVR' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('"More in glossary" opens the panel at this term', async () => {
    render(<Term id="cohesion">Cohesion</Term>);
    await userEvent.click(screen.getByRole('button', { name: 'Cohesion' }));
    await userEvent.click(screen.getByRole('button', { name: 'More in glossary' }));
    expect(useOnboardingStore.getState()).toMatchObject({
      glossaryOpen: true,
      glossaryFocus: 'cohesion',
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shifts left when it would overflow the right edge', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 200,
      right: 460,
      top: 0,
      bottom: 0,
      width: 260,
      height: 0,
      x: 200,
      y: 0,
      toJSON: () => ({}),
    });
    render(<Term id="pwar">pWAR</Term>);
    await userEvent.click(screen.getByRole('button', { name: 'pWAR' }));
    // right 460 - (320 - 8) = 148 over; left has 200 - 8 = 192 room → shift 148
    expect(screen.getByRole('tooltip')).toHaveStyle({ left: '-148px' });
    rect.mockRestore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });
});
