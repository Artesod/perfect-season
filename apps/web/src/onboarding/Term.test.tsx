import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
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
    // Trigger starts at x=200, but a 260px popover must end 8px inside a
    // 320px screen: 320 - 260 - 8 = 52.
    expect(screen.getByRole('tooltip')).toHaveStyle({ left: '52px' });
    rect.mockRestore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('renders the popover on document.body so parent layers cannot cover or clip it', async () => {
    const { container } = render(<Term id="pwar">pWAR</Term>);
    await userEvent.click(screen.getByRole('button', { name: 'pWAR' }));
    const tooltip = screen.getByRole('tooltip');
    expect(container.contains(tooltip)).toBe(false);
    expect(tooltip.parentElement).toBe(document.body);
  });

  it('stays open while the pointer moves from the term onto the popover', async () => {
    render(<Term id="cohesion">Cohesion</Term>);
    await userEvent.hover(screen.getByRole('button', { name: 'Cohesion' }));
    await userEvent.hover(screen.getByRole('tooltip'));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('closes when the page scrolls', async () => {
    render(<Term id="ovr">OVR</Term>);
    await userEvent.click(screen.getByRole('button', { name: 'OVR' }));
    fireEvent.scroll(window);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });
});
