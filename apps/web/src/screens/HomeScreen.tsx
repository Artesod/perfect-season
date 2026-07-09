import { useState } from 'react';
import { BADGES, difficultyFor, unlockedAscension } from '@perfect-season/sim';
import { LeaderboardPanel } from '../components/LeaderboardPanel';
import { NBA_DATASET } from '../nbaData';
import { useGameStore } from '../store';
import './HomeScreen.css';

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function HomeScreen() {
  const meta = useGameStore((s) => s.meta);
  const newRun = useGameStore((s) => s.newRun);

  const maxUnlocked = unlockedAscension(meta);
  const [seedText, setSeedText] = useState(() => String(randomSeed()));
  const [ascension, setAscension] = useState(0);
  const [useRealPlayers, setUseRealPlayers] = useState(NBA_DATASET !== null);

  const seed = Number.parseInt(seedText, 10);
  const seedValid = Number.isFinite(seed);
  const mods = difficultyFor(ascension);

  return (
    <div className="home">
      <section className="panel home-hero">
        <h2>Go 82–0. Or go home.</h2>
        <p className="muted">
          Draft a 15-man roster under the cap, then survive an entire season without losing.
          Injuries, slumps, and locker-room drama stand in your way. One loss ends the run.
        </p>
      </section>

      <div className="home-grid">
        <section className="panel">
          <h3>New run</h3>
          <label className="field">
            <span className="field-label">Seed</span>
            <div className="field-row">
              <input
                type="text"
                inputMode="numeric"
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                aria-label="Run seed"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSeedText(String(randomSeed()))}
              >
                Random
              </button>
            </div>
            <span className="field-hint">Same seed + ascension = same run. Share it.</span>
          </label>

          <div className="field">
            <span className="field-label">Player pool</span>
            <div className="seg">
              <button
                type="button"
                className={`seg-btn ${useRealPlayers ? 'selected' : ''}`}
                disabled={NBA_DATASET === null}
                title={NBA_DATASET === null ? 'Real player data unavailable' : undefined}
                onClick={() => setUseRealPlayers(true)}
              >
                Real NBA rosters
              </button>
              <button
                type="button"
                className={`seg-btn ${useRealPlayers ? '' : 'selected'}`}
                onClick={() => setUseRealPlayers(false)}
              >
                Fictional players
              </button>
            </div>
            <span className="field-hint">
              {useRealPlayers && NBA_DATASET
                ? `2K ratings as of ${NBA_DATASET.fetchedAt} — your team replaces one real franchise`
                : 'Procedurally generated league, unique to each seed'}
            </span>
          </div>

          <div className="field">
            <span className="field-label">Ascension</span>
            <div className="ascension-picker">
              {Array.from({ length: 6 }, (_, level) => {
                const locked = level > maxUnlocked;
                return (
                  <button
                    key={level}
                    type="button"
                    className={`ascension-btn ${level === ascension ? 'selected' : ''}`}
                    disabled={locked}
                    title={locked ? `Win at ascension ${level - 1} to unlock` : undefined}
                    onClick={() => setAscension(level)}
                  >
                    {locked ? '🔒' : level}
                  </button>
                );
              })}
            </div>
            <ul className="mods-list">
              <li>CPU teams: {mods.cpuOverallBonus > 0 ? `+${mods.cpuOverallBonus} overall` : 'baseline'}</li>
              <li>Event chance: ×{mods.eventChanceMultiplier}</li>
              <li>Salary cap: {mods.capReduction > 0 ? `−$${mods.capReduction}M` : 'full'}</li>
              <li>
                Lives: {mods.lives} — {mods.lives === 1 ? 'one loss ends the run' : `${mods.lives} losses allowed`}
              </li>
            </ul>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!seedValid}
            onClick={() => newRun(seed, ascension, useRealPlayers ? NBA_DATASET : null)}
          >
            Start run
          </button>
        </section>

        <section className="panel">
          <h3>Career</h3>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-value">{meta.totalRuns}</span>
              <span className="stat-label">Runs</span>
            </div>
            <div className="stat">
              <span className="stat-value">{meta.runsWon}</span>
              <span className="stat-label">Perfect seasons</span>
            </div>
            <div className="stat">
              <span className="stat-value">{meta.bestWins}</span>
              <span className="stat-label">Best wins</span>
            </div>
          </div>

          <h3>Badges</h3>
          <ul className="badge-list">
            {BADGES.map((badge) => {
              const earned = meta.badges.includes(badge.id);
              return (
                <li key={badge.id} className={`badge-item ${earned ? 'earned' : 'locked'}`}>
                  <span className="badge-icon">{earned ? '🏅' : '·'}</span>
                  <span>{badge.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <LeaderboardPanel />
    </div>
  );
}
