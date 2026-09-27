import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { GLOSSARY, type TermId } from './glossary';
import { GlossaryPanel } from './GlossaryPanel';
import { useOnboardingStore } from './onboardingStore';

const TERM_COUNT = Object.keys(GLOSSARY).length;

beforeEach(() => {
  useOnboardingStore.setState({ glossaryOpen: false, glossaryFocus: null });
});

function openPanel(focus?: TermId) {
  useOnboardingStore.getState().openGlossary(focus);
  render(<GlossaryPanel />);
  return screen.getByRole('dialog', { name: 'Glossary' });
}

describe('GlossaryPanel', () => {
  it('renders nothing while closed', () => {
    render(<GlossaryPanel />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every term when opened', () => {
    const dialog = openPanel();
    expect(within(dialog).getAllByRole('term')).toHaveLength(TERM_COUNT);
  });

  it('filters as the user types', async () => {
    const dialog = openPanel();
    await userEvent.type(within(dialog).getByRole('searchbox'), 'dead');
    expect(within(dialog).getByText('Dead cap')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('term').length).toBeLessThan(TERM_COUNT);
  });

  it('says so when nothing matches', async () => {
    const dialog = openPanel();
    await userEvent.type(within(dialog).getByRole('searchbox'), 'zzzz');
    expect(within(dialog).getByText(/No terms match/)).toBeInTheDocument();
  });

  it('highlights the term it was opened at', () => {
    const dialog = openPanel('pwar');
    expect(dialog.querySelector('#glossary-pwar')).toHaveClass('focused');
  });

  it('closes on Escape, on the Close button, and on a backdrop click', async () => {
    openPanel();
    await userEvent.keyboard('{Escape}');
    expect(useOnboardingStore.getState().glossaryOpen).toBe(false);

    useOnboardingStore.getState().openGlossary();
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(useOnboardingStore.getState().glossaryOpen).toBe(false);

    useOnboardingStore.getState().openGlossary();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(dialog.parentElement!);
    expect(useOnboardingStore.getState().glossaryOpen).toBe(false);
  });
});
