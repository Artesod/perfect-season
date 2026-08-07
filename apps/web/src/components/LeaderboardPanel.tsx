import { useEffect, useState } from 'react';
import { useAccountStore } from '../account';
import { fetchLeaderboard, type LeaderboardEntry } from '../cloud';

/**
 * Global top runs (most wins, hardest ascension first). Renders nothing when
 * Supabase isn't configured. Signing in isn't required to look.
 */
export function LeaderboardPanel() {
  const enabled = useAccountStore((s) => s.enabled);
  const userId = useAccountStore((s) => s.user?.id);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchLeaderboard()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <section className="panel">
      <h3>Leaderboard</h3>
      {error ? (
        <p className="muted">Couldn’t load the leaderboard. Try again later.</p>
      ) : entries === null ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="muted">No runs on the board yet. Finish a run while signed in to claim it.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Player</th>
              <th className="num">Record</th>
              <th className="num">Ascension</th>
              <th className="num">Seed</th>
              <th>Pool</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id}>
                <td className="num muted">{i + 1}</td>
                <td className={entry.userId === userId ? 'strong' : undefined}>
                  {entry.won && <span title="Season won">🏆 </span>}
                  {entry.displayName}
                </td>
                <td className="num rating">
                  {entry.wins}–{entry.losses}
                </td>
                <td className="num">{entry.ascension}</td>
                <td className="num muted">{entry.seed}</td>
                <td className="muted small">
                  {entry.datasetVersion ? `NBA ${entry.datasetVersion}` : 'Fictional'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
