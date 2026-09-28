import { unlockedAscension } from '@perfect-season/sim';
import { poolForMode } from '../nbaData';
import { POOL_LABELS } from '../share/shareText';
import { poolVersion, useGameStore } from '../store';
import './ChallengeBanner.css';

export function ChallengeBanner() {
  const challenge = useGameStore((s) => s.challenge);
  const meta = useGameStore((s) => s.meta);
  const newRun = useGameStore((s) => s.newRun);
  const dismissChallenge = useGameStore((s) => s.dismissChallenge);
  if (!challenge) return null;

  const pool = poolForMode(challenge.pool);
  const available = challenge.pool === 'procedural' || pool !== null;
  const locked = challenge.ascension > unlockedAscension(meta);
  const drifted =
    available &&
    challenge.datasetVersion !== null &&
    challenge.datasetVersion !== poolVersion(pool);

  const start = () =>
    newRun(challenge.seed, challenge.ascension, pool, challenge.casual, {
      challenge: { wins: challenge.wins, losses: challenge.losses, result: challenge.result },
    });

  return (
    <section className="panel challenge-banner" aria-label="Challenge">
      <span className="challenge-kicker">Challenge</span>
      <h3>
        Beat {challenge.wins}–{challenge.losses}
      </h3>
      <p className="muted">
        Asc {challenge.ascension} · {POOL_LABELS[challenge.pool]} · seed {challenge.seed}
        {challenge.casual && ' · casual'}
      </p>
      {locked && (
        <p className="challenge-note">
          Unranked — Asc {challenge.ascension} not unlocked. No badges, unlocks, or leaderboard
          entry.
        </p>
      )}
      {drifted && (
        <p className="challenge-note">Rosters updated since this run — results may differ.</p>
      )}
      {!available && <p className="challenge-note bad">This pool isn't available in this build.</p>}
      <div className="challenge-actions">
        <button type="button" className="btn btn-primary" disabled={!available} onClick={start}>
          Start challenge
        </button>
        <button type="button" className="btn btn-ghost" onClick={dismissChallenge}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
