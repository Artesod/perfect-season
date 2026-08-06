import { useState } from 'react';
import type { PoolMode } from '@perfect-season/shared';
import {
  BADGES,
  CASUAL_CPU_REDUCTION,
  difficultyFor,
  runCpuBonus,
  unlockedAscension,
} from '@perfect-season/sim';
import { LeaderboardPanel } from '../components/LeaderboardPanel';
import { ERA_DATASET, NBA_DATASET, poolForMode } from '../nbaData';
import { useGameStore } from '../store';
import './HomeScreen.css';

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

type PoolChoice = PoolMode | 'procedural';

const POOL_CHOICES: { mode: PoolChoice; label: string; hint: string }[] = [
  {
    mode: 'current',
    label: 'Current NBA',
    hint: '2K ratings for this season’s rosters — your team replaces one real franchise',
  },
  {
    mode: 'classic',
    label: 'Classic eras',
    hint: 'Historical season teams (1965–2019) — draft era versions like Jordan ’96',
  },
  {
    mode: 'all-time',
    label: 'All-Time',
    hint: 'Every franchise’s all-time roster — a league of nothing but legends',
  },
  {
    mode: 'mixed',
    label: 'Mixed',
    hint: 'Current, classic, and all-time teams in one giant pool — only one version of a player may be rostered',
  },
  {
    mode: 'procedural',
    label: 'Fictional',
    hint: 'Procedurally generated league, unique to each seed',
  },
];

export function HomeScreen() {
  const meta = useGameStore((s) => s.meta);
  const newRun = useGameStore((s) => s.newRun);

  const maxUnlocked = unlockedAscension(meta);
  const [seedText, setSeedText] = useState(() => String(randomSeed()));
  const [ascension, setAscension] = useState(0);
  const [poolMode, setPoolMode] = useState<PoolChoice>(NBA_DATASET ? 'current' : 'procedural');
  const [casual, setCasual] = useState(false);

  const seed = Number.parseInt(seedText, 10);
  const seedValid = Number.isFinite(seed);
  const mods = difficultyFor(ascension);
  const selectedChoice = POOL_CHOICES.find((c) => c.mode === poolMode)!;
  const datasetDates = [
    NBA_DATASET && poolMode !== 'procedural' && poolMode !== 'classic' && poolMode !== 'all-time'
      ? NBA_DATASET.fetchedAt
      : null,
    ERA_DATASET && (poolMode === 'classic' || poolMode === 'all-time' || poolMode === 'mixed')
      ? ERA_DATASET.fetchedAt
      : null,
  ].filter(Boolean);

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
              {POOL_CHOICES.map((choice) => {
                const available = choice.mode === 'procedural' || poolForMode(choice.mode) !== null;
                return (
                  <button
                    key={choice.mode}
                    type="button"
                    className={`seg-btn ${poolMode === choice.mode ? 'selected' : ''}`}
                    disabled={!available}
                    title={available ? undefined : 'Player data unavailable'}
                    onClick={() => setPoolMode(choice.mode)}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <span className="field-hint">
              {selectedChoice.hint}
              {datasetDates.length > 0 ? ` · ratings as of ${datasetDates.join(' / ')}` : ''}
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
              <li>
                CPU teams:{' '}
                {(() => {
                  const cpuBonus = runCpuBonus(ascension, casual);
                  if (cpuBonus > 0) return `+${cpuBonus} overall`;
                  if (cpuBonus < 0) return `−${-cpuBonus} overall (casual)`;
                  return 'baseline';
                })()}
              </li>
              <li>Event chance: ×{mods.eventChanceMultiplier}</li>
              <li>
                Salary cap:{' '}
                {casual
                  ? 'none (casual)'
                  : mods.capReduction > 0
                    ? `−$${mods.capReduction}M`
                    : 'full'}
              </li>
              <li>
                Lives: {mods.lives} — {mods.lives === 1 ? 'one loss ends the run' : `${mods.lives} losses allowed`}
              </li>
            </ul>
          </div>

          <div className="field">
            <span className="field-label">Cap style</span>
            <div className="seg">
              <button
                type="button"
                className={`seg-btn ${casual ? '' : 'selected'}`}
                onClick={() => setCasual(false)}
              >
                Standard
              </button>
              <button
                type="button"
                className={`seg-btn ${casual ? 'selected' : ''}`}
                onClick={() => setCasual(true)}
              >
                Casual
              </button>
            </div>
            <span className="field-hint">
              {casual
                ? `No salary cap and softer CPU teams (−${CASUAL_CPU_REDUCTION} overall) — counts in career stats, but no badges, ascension unlocks, or leaderboard entries`
                : 'The full cap squeeze — badges, unlocks, and leaderboard entries at stake'}
            </span>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!seedValid}
            onClick={() => newRun(seed, ascension, poolForMode(poolMode), casual)}
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
