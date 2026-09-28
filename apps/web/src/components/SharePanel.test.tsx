import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunState } from '@perfect-season/shared';

vi.mock('../cloud', () => ({ syncFinishedRun: vi.fn() }));
vi.mock('../share/renderCard', () => ({ renderCard: vi.fn() }));

import { renderCard } from '../share/renderCard';
import { useGameStore } from '../store';
import { SharePanel } from './SharePanel';

const run = {
  seed: 48213,
  ascension: 2,
  casual: false,
  livesRemaining: 0,
  league: [],
  draft: null,
  roster: [],
  season: null,
  wins: 71,
  losses: 11,
  status: 'lost',
} as RunState;

const png = new Blob(['png'], { type: 'image/png' });
const writeText = vi.fn();

beforeEach(() => {
  vi.mocked(renderCard).mockResolvedValue(png);
  URL.createObjectURL = vi.fn(() => 'blob:card');
  URL.revokeObjectURL = vi.fn();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  useGameStore.setState({ run, runPool: null });
});

afterEach(() => vi.restoreAllMocks());

describe('SharePanel', () => {
  it('previews the card and offers a PNG download', async () => {
    render(<SharePanel onClose={() => {}} />);
    expect(await screen.findByRole('img', { name: /run over 71–11/i })).toHaveAttribute(
      'src',
      'blob:card',
    );
    const download = screen.getByRole('link', { name: 'Download PNG' });
    expect(download).toHaveAttribute('href', 'blob:card');
    expect(download).toHaveAttribute('download', 'perfect-season-48213.png');
  });

  it('hides the native share button when unsupported and shows it when supported', async () => {
    const { unmount } = render(<SharePanel onClose={() => {}} />);
    await screen.findByRole('img');
    expect(screen.queryByRole('button', { name: 'Share…' })).toBeNull();
    unmount();
    Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true });
    render(<SharePanel onClose={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Share…' })).toBeInTheDocument();
  });

  it('copies the challenge link', async () => {
    render(<SharePanel onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    const copied = new URL(writeText.mock.calls[0][0] as string);
    expect(copied.searchParams.get('seed')).toBe('48213');
    expect(copied.searchParams.get('w')).toBe('71');
    expect(copied.searchParams.get('r')).toBe('lost');
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
  });

  it('copies text followed by the link', async () => {
    render(<SharePanel onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy text' }));
    expect(writeText.mock.calls[0][0]).toMatch(
      /^Made it to 71–11 in Perfect Season\. .* https?:\/\/\S+\?c=1&/,
    );
  });

  it('falls back to a prompt when the clipboard API is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    render(<SharePanel onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(prompt).toHaveBeenCalledWith('Copy your link:', expect.stringContaining('seed=48213'));
  });

  it('links to each social site in a new tab with its icon', () => {
    render(<SharePanel onClose={() => {}} />);
    for (const site of ['X', 'Reddit', 'Facebook', 'WhatsApp', 'Bluesky']) {
      const link = screen.getByRole('link', { name: `Share on ${site}` });
      expect(link).toHaveAttribute('title', `Share on ${site}`);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      // Icon only: the brand mark replaces the text label
      expect(link.querySelector('svg')).not.toBeNull();
      expect(link).not.toHaveTextContent(site);
    }
  });

  it('shows image unavailable when drawing fails', async () => {
    vi.mocked(renderCard).mockResolvedValue(null);
    render(<SharePanel onClose={() => {}} />);
    expect(await screen.findByText('Image unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download PNG' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
  });

  it('does nothing if closed before the card finishes drawing', async () => {
    let finish!: (blob: Blob) => void;
    vi.mocked(renderCard).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { unmount } = render(<SharePanel onClose={() => {}} />);
    unmount();
    await act(async () => finish(png));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('closes from the Close button and Escape', async () => {
    const onClose = vi.fn();
    render(<SharePanel onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });
});
