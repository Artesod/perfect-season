import type { ReactNode } from 'react';
import type { Player } from '@perfect-season/shared';
import { money } from '../format';
import { Term } from '../onboarding/Term';
import { PlayerAvatar } from './PlayerAvatar';
import { TraitTags } from './TraitTags';
import './PlayerInfoModal.css';

function StatTile({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-value">{value}</span>
      <span className="stat-tile-label">{label}</span>
    </div>
  );
}

const pctText = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

/** Detail card behind each player's info button: game ratings + real stats. */
export function PlayerInfoModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const stats = player.stats;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal player-info"
        role="dialog"
        aria-modal="true"
        aria-label={player.name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="player-info-head">
          <PlayerAvatar player={player} size={64} />
          <div className="player-info-id">
            <h3>{player.name}</h3>
            <span className="muted">
              {player.position} · {money(player.salary)} · {player.pWAR.toFixed(1)}{' '}
              <Term id="pwar">pWAR</Term>
            </span>
            <TraitTags traits={player.traits} />
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="player-info-section">
          <h4>Ratings</h4>
          <div className="stat-grid">
            <StatTile label={<Term id="ovr">Overall</Term>} value={String(player.overall)} />
            <StatTile label={<Term id="offense">Offense</Term>} value={String(player.offense)} />
            <StatTile label={<Term id="defense">Defense</Term>} value={String(player.defense)} />
          </div>
        </div>

        <div className="player-info-section">
          <h4>{stats ? `${stats.season} per game` : 'Per-game stats'}</h4>
          {stats ? (
            <div className="stat-grid">
              <StatTile label={<Term id="ppg">PPG</Term>} value={stats.points.toFixed(1)} />
              <StatTile label={<Term id="rpg">RPG</Term>} value={stats.rebounds.toFixed(1)} />
              <StatTile label={<Term id="apg">APG</Term>} value={stats.assists.toFixed(1)} />
              <StatTile label={<Term id="spg">SPG</Term>} value={stats.steals.toFixed(1)} />
              <StatTile label={<Term id="bpg">BPG</Term>} value={stats.blocks.toFixed(1)} />
              <StatTile label={<Term id="mpg">MPG</Term>} value={stats.minutes.toFixed(1)} />
              <StatTile label={<Term id="fg-pct">FG%</Term>} value={pctText(stats.fgPct)} />
              <StatTile label={<Term id="three-pct">3P%</Term>} value={pctText(stats.threePct)} />
              <StatTile label={<Term id="gp">GP</Term>} value={String(stats.gamesPlayed)} />
            </div>
          ) : (
            <p className="muted player-info-none">
              No real-world stats for this player
              {player.imageUrl === undefined ? ' — procedurally generated' : ''}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
