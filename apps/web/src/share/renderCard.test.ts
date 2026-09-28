import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderCard, type CardData } from './renderCard';

const data: CardData = {
  kicker: 'Perfect season',
  headline: '82–0',
  won: true,
  tags: ['Asc 2', 'Current NBA'],
  seed: 48213,
  challengeUrl: 'https://example.test/?c=1&seed=48213',
  siteLabel: 'example.test',
};

/** Records every 2D-context method call; property writes are ignored */
function fakeContext() {
  const calls: { method: string; args: unknown[] }[] = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
          return () => gradient;
        }
        if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
        return (...args: unknown[]) => calls.push({ method: String(prop), args });
      },
      set: () => true,
    },
  );
  return { ctx, calls };
}

afterEach(() => vi.restoreAllMocks());

describe('renderCard', () => {
  it('returns null when the canvas has no 2D context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(await renderCard(data)).toBeNull();
  });

  it('draws the result and exports a PNG', async () => {
    const { ctx, calls } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    const png = new Blob(['png'], { type: 'image/png' });
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb) => cb(png));

    expect(await renderCard(data)).toBe(png);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    const texts = calls.filter((c) => c.method === 'fillText').map((c) => c.args[0]);
    expect(texts).toEqual(
      expect.arrayContaining([
        'PERFECT SEASON',
        '82–0',
        'Asc 2 · Current NBA',
        'Seed 48213',
        'Can you beat it?',
        'example.test',
      ]),
    );
    // QR modules drawn as filled squares
    expect(calls.filter((c) => c.method === 'fillRect').length).toBeGreaterThan(50);
  });

  it('returns null when export fails', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext().ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null));
    expect(await renderCard(data)).toBeNull();
  });
});
