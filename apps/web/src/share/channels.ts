export interface SocialLink {
  id: 'x' | 'reddit' | 'facebook' | 'whatsapp' | 'bluesky';
  label: string;
  href: string;
}

function withQuery(base: string, params: Record<string, string>): string {
  return `${base}?${new URLSearchParams(params).toString()}`;
}

/** Web-intent links; these carry text and link only, never the image */
export function socialLinks(text: string, url: string): SocialLink[] {
  const message = `${text} ${url}`;
  return [
    { id: 'x', label: 'X', href: withQuery('https://x.com/intent/post', { text, url }) },
    {
      id: 'reddit',
      label: 'Reddit',
      href: withQuery('https://www.reddit.com/submit', { url, title: text }),
    },
    {
      id: 'facebook',
      label: 'Facebook',
      href: withQuery('https://www.facebook.com/sharer/sharer.php', { u: url }),
    },
    { id: 'whatsapp', label: 'WhatsApp', href: withQuery('https://wa.me/', { text: message }) },
    {
      id: 'bluesky',
      label: 'Bluesky',
      href: withQuery('https://bsky.app/intent/compose', { text: message }),
    },
  ];
}

export function canNativeShare(): boolean {
  return typeof navigator.share === 'function';
}

export type NativeShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed';

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * System share sheet. Tries with the card image when the browser can share
 * files, then falls back to text + link.
 */
export async function nativeShare(input: {
  text: string;
  url: string;
  file: File | null;
}): Promise<NativeShareOutcome> {
  if (!canNativeShare()) return 'unsupported';
  const textOnly: ShareData = { text: input.text, url: input.url };
  const withFile =
    input.file && navigator.canShare?.({ files: [input.file] })
      ? { ...textOnly, files: [input.file] }
      : null;
  try {
    await navigator.share(withFile ?? textOnly);
    return 'shared';
  } catch (error) {
    if (isAbort(error)) return 'cancelled';
    if (!withFile) return 'failed';
  }
  try {
    await navigator.share(textOnly);
    return 'shared';
  } catch (error) {
    return isAbort(error) ? 'cancelled' : 'failed';
  }
}
