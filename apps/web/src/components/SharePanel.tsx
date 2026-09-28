import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { encodeChallenge, siteBaseUrl, siteLabel, type PoolChoice } from '../share/challengeLink';
import { canNativeShare, nativeShare, socialLinks } from '../share/channels';
import { renderCard } from '../share/renderCard';
import { buildShareText, runHeadline, runTags } from '../share/shareText';
import { SocialIcon, socialIconColor } from '../share/socialIcons';
import { poolVersion, useGameStore } from '../store';
import './EventCardModal.css';
import './SharePanel.css';

type CardImage = { blob: Blob; url: string } | 'pending' | 'failed';

export function SharePanel({ onClose }: { onClose: () => void }) {
  const run = useGameStore((s) => s.run)!;
  const runPool = useGameStore((s) => s.runPool);
  const pool: PoolChoice = runPool?.mode ?? 'procedural';
  const [image, setImage] = useState<CardImage>('pending');
  const [status, setStatus] = useState<string | null>(null);

  const { kicker, headline } = runHeadline(run);
  const fileName = `perfect-season-${run.seed}.png`;
  const text = buildShareText(run);
  const url = useMemo(
    () =>
      encodeChallenge(
        {
          seed: run.seed,
          ascension: run.ascension,
          pool,
          casual: run.casual,
          wins: run.wins,
          losses: run.losses,
          result: run.status === 'won' ? 'won' : 'lost',
          datasetVersion: poolVersion(runPool),
        },
        siteBaseUrl(),
      ),
    [run, pool, runPool],
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    renderCard({
      kicker,
      headline,
      won: run.status === 'won',
      tags: runTags(run, pool),
      seed: run.seed,
      challengeUrl: url,
      siteLabel: siteLabel(),
    })
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setImage('failed');
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setImage({ blob, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setImage('failed');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [run, pool, url, kicker, headline]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (value: string, label: 'Link' | 'Text') => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied`);
    } catch {
      window.prompt(`Copy your ${label.toLowerCase()}:`, value);
    }
  };

  const share = async () => {
    const file =
      typeof image === 'object' ? new File([image.blob], fileName, { type: 'image/png' }) : null;
    const outcome = await nativeShare({ text, url, file });
    setStatus(outcome === 'failed' ? 'Sharing failed — try Copy link.' : null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal share-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Share your run"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="share-head">
          <h3>Share your run</h3>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="share-preview">
          {image === 'pending' ? (
            <p className="muted">Drawing your card…</p>
          ) : image === 'failed' ? (
            <p className="muted">Image unavailable</p>
          ) : (
            <img src={image.url} alt={`${kicker} ${headline} card`} />
          )}
        </div>

        <div className="share-actions">
          {canNativeShare() && (
            <button type="button" className="btn btn-primary" onClick={share}>
              Share…
            </button>
          )}
          <button type="button" className="btn" onClick={() => copy(url, 'Link')}>
            Copy link
          </button>
          <button type="button" className="btn" onClick={() => copy(`${text} ${url}`, 'Text')}>
            Copy text
          </button>
          {typeof image === 'object' && (
            <a className="btn" href={image.url} download={fileName}>
              Download PNG
            </a>
          )}
        </div>

        <div className="share-social">
          {socialLinks(text, url).map((link) => (
            <a
              key={link.id}
              className="share-social-link"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Share on ${link.label}`}
              title={`Share on ${link.label}`}
              style={{ '--brand': socialIconColor(link.id) } as CSSProperties}
            >
              <SocialIcon id={link.id} />
            </a>
          ))}
        </div>

        <p className="share-status muted" role="status">
          {status}
        </p>
      </div>
    </div>
  );
}
