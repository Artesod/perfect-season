import { useState } from 'react';
import { BADGES, USER_TEAM_ID } from '@perfect-season/sim';
import { SharePanel } from '../components/SharePanel';
import { compareResults, outcomeLabel } from '../share/compare';
import { useGameStore } from '../store';
import './RunSummaryScreen.css';

export function RunSummaryScreen() {
  const run = useGameStore((s) => s.run)!;
  const newBadges = useGameStore((s) => s.newBadges);
  const exitRun = useGameStore((s) => s.exitRun);
  const [sharing, setSharing] = useState(false);

  const won = run.status === 'won';
  const season = run.season!;
  const injuries = season.events.filter((e) => e.type === 'injury').length;
  const cards = season.events.filter((e) => e.type === 'morale').length;
  const closeGames = season.results.filter(
    (r) => Math.abs(r.homeScore - r.awayScore) <= 5,
  ).length;
  const bestWin = season.results
    .filter((r) => r.winnerTeamId === USER_TEAM_ID)
    .reduce<number | null>((best, r) => {
      const userProb = r.homeTeamId === USER_TEAM_ID ? r.homeWinProbability : 1 - r.homeWinProbability;
      return best === null ? userProb : Math.min(best, userProb);
    }, null);

  return (
    <div className="summary">
      <section className={`panel summary-banner ${won ? 'won' : 'lost'}`}>
        <span className="summary-kicker">
          {won ? (run.losses === 0 ? 'Perfect season' : 'Season complete') : 'Run over'}
        </span>
        <h2>
          {won
            ? run.losses === 0
              ? '82–0. Immortality.'
              : `Season survived at ${run.wins}–${run.losses}.`
            : `The dream dies at ${run.wins}–${run.losses}.`}
        </h2>
        <p className="muted">
          Ascension {run.ascension} · seed {run.seed}
          {run.casual && ' · casual (no cap)'}
        </p>
        {run.challenge && (
          <p className="summary-challenge">
            You {run.wins}–{run.losses} vs challenger {run.challenge.wins}–{run.challenge.losses} —{' '}
            {outcomeLabel(
              compareResults(
                { wins: run.wins, losses: run.losses, result: won ? 'won' : 'lost' },
                run.challenge,
              ),
            )}
            {run.unranked && ' · unranked'}
          </p>
        )}
      </section>

      <div className="summary-grid">
        <section className="panel">
          <h3>Run stats</h3>
          <dl className="kv">
            <div>
              <dt>Final record</dt>
              <dd>
                {run.wins}–{run.losses}
              </dd>
            </div>
            <div>
              <dt>Injuries suffered</dt>
              <dd>{injuries}</dd>
            </div>
            <div>
              <dt>Locker-room events</dt>
              <dd>{cards}</dd>
            </div>
            <div>
              <dt>Close games (≤5 pts)</dt>
              <dd>{closeGames}</dd>
            </div>
            {bestWin !== null && (
              <div>
                <dt>Biggest upset win</dt>
                <dd>{Math.round(bestWin * 100)}% pre-game odds</dd>
              </div>
            )}
            <div>
              <dt>Dead cap carried</dt>
              <dd>${season.deadCap.toFixed(1)}M</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h3>Badges earned</h3>
          {newBadges.length === 0 ? (
            <p className="muted">No new badges this run.</p>
          ) : (
            <ul className="badge-list">
              {newBadges.map((id) => (
                <li key={id} className="badge-item earned">
                  <span className="badge-icon">🏅</span>
                  <span>{BADGES.find((b) => b.id === id)?.label ?? id}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="summary-actions">
        <button type="button" className="btn" onClick={() => setSharing(true)}>
          Share run
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={exitRun}>
          New run
        </button>
      </div>
      {sharing && <SharePanel onClose={() => setSharing(false)} />}
    </div>
  );
}
