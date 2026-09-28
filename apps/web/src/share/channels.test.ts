import { afterEach, describe, expect, it, vi } from 'vitest';
import { canNativeShare, nativeShare, socialLinks } from './channels';

const TEXT = 'Went 82–0 in Perfect Season 🏆 Asc 2 · seed 48213. Can you beat it?';
const LINK = 'https://example.test/perfect-season/?c=1&seed=48213&asc=2';

function setShare(share?: unknown, canShare?: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
}

afterEach(() => setShare(undefined, undefined));

describe('socialLinks', () => {
  const links = Object.fromEntries(socialLinks(TEXT, LINK).map((l) => [l.id, new URL(l.href)]));

  it('offers the five sites in order', () => {
    expect(socialLinks(TEXT, LINK).map((l) => l.id)).toEqual([
      'x',
      'reddit',
      'facebook',
      'whatsapp',
      'bluesky',
    ]);
  });
  it('encodes text and link for X', () => {
    expect(links.x.origin).toBe('https://x.com');
    expect(links.x.searchParams.get('text')).toBe(TEXT);
    expect(links.x.searchParams.get('url')).toBe(LINK);
  });
  it('uses the link as the Reddit URL and text as title', () => {
    expect(links.reddit.searchParams.get('url')).toBe(LINK);
    expect(links.reddit.searchParams.get('title')).toBe(TEXT);
  });
  it('shares only the link on Facebook', () => {
    expect(links.facebook.searchParams.get('u')).toBe(LINK);
  });
  it('puts text and link in one message for WhatsApp and Bluesky', () => {
    expect(links.whatsapp.searchParams.get('text')).toBe(`${TEXT} ${LINK}`);
    expect(links.bluesky.searchParams.get('text')).toBe(`${TEXT} ${LINK}`);
  });
});

describe('nativeShare', () => {
  const file = new File(['png'], 'card.png', { type: 'image/png' });

  it('reports unsupported without navigator.share', async () => {
    expect(canNativeShare()).toBe(false);
    expect(await nativeShare({ text: TEXT, url: LINK, file })).toBe('unsupported');
  });

  it('shares the image when the browser can', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share, () => true);
    expect(canNativeShare()).toBe(true);
    expect(await nativeShare({ text: TEXT, url: LINK, file })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: TEXT, url: LINK, files: [file] });
  });

  it('shares text only when files are not supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share, () => false);
    expect(await nativeShare({ text: TEXT, url: LINK, file })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: TEXT, url: LINK });
  });

  it('treats AbortError as a cancel', async () => {
    setShare(vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')), () => true);
    expect(await nativeShare({ text: TEXT, url: LINK, file })).toBe('cancelled');
  });

  it('retries without the image when sharing it fails', async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('x', 'NotAllowedError'))
      .mockResolvedValue(undefined);
    setShare(share, () => true);
    expect(await nativeShare({ text: TEXT, url: LINK, file })).toBe('shared');
    expect(share).toHaveBeenLastCalledWith({ text: TEXT, url: LINK });
  });

  it('reports failure when the text retry fails too', async () => {
    setShare(vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError')), () => true);
    expect(await nativeShare({ text: TEXT, url: LINK, file })).toBe('failed');
  });
});
