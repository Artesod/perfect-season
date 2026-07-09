import { useState } from 'react';
import type { Player } from '@perfect-season/shared';
import './PlayerAvatar.css';

/**
 * Player headshot with a generic gray-silhouette fallback for procedural
 * players, missing images, and load failures. `referrerPolicy="no-referrer"`
 * is required: the image CDN serves requests without a Referer header but
 * 403s foreign referers.
 */
export function PlayerAvatar({ player, size = 40 }: { player: Player; size?: number }) {
  const [failed, setFailed] = useState(false);
  const showImage = player.imageUrl !== undefined && !failed;

  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      {showImage ? (
        <img
          src={player.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <svg viewBox="0 0 24 24" className="avatar-fallback">
          <circle cx="12" cy="8.2" r="3.6" />
          <path d="M12 13.4c-4.1 0-7.4 2.6-7.4 6.4V24h14.8v-4.2c0-3.8-3.3-6.4-7.4-6.4z" />
        </svg>
      )}
    </span>
  );
}
