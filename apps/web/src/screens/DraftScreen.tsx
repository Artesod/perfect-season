import { useMemo, useState } from 'react';
import {
  MIN_PER_POSITION,
  MIN_SALARY,
  POSITIONS,
  ROSTER_SIZE,
  SALARY_CAP,
  type Player,
  type Position,
} from '@perfect-season/shared';
import {
  computeChemistry,
  chemistryDelta,
  difficultyFor,
  runCanDraft,
  totalSalary,
  validateRoster,
} from '@perfect-season/sim';
import { ChemistryPanel } from '../components/ChemistryPanel';
import { TraitTags } from '../components/TraitTags';
import { money } from '../format';
import { useGameStore } from '../store';
import './DraftScreen.css';

type SortKey = 'overall' | 'salary' | 'pWAR';

export function DraftScreen() {
  const run = useGameStore((s) => s.run)!;
  const draftPlayer = useGameStore((s) => s.draftPlayer);
  const undraftPlayer = useGameStore((s) => s.undraftPlayer);
  const beginSeason = useGameStore((s) => s.beginSeason);

  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [positionFilter, setPositionFilter] = useState<Position | 'ALL'>('ALL');

  const draft = run.draft!;
  const capReduction = difficultyFor(run.ascension).capReduction;
  const effectiveCap = SALARY_CAP - capReduction;
  const committed = totalSalary(draft.roster);
  const space = effectiveCap - committed;
  const slotsLeft = ROSTER_SIZE - draft.roster.length;
  const reserveNeeded = Math.max(0, slotsLeft - 1) * MIN_SALARY;

  const validation = validateRoster(draft.roster, capReduction);
  const chemistry = computeChemistry(draft.roster);

  const pool = useMemo(() => {
    const filtered =
      positionFilter === 'ALL'
        ? draft.pool
        : draft.pool.filter((p) => p.position === positionFilter);
    return [...filtered].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [draft.pool, positionFilter, sortKey]);

  return (
    <div className="draft">
      <div className="draft-main">
        <section className="panel">
          <div className="panel-head">
            <h3>
              Draft pool <span className="muted">({pool.length})</span>
            </h3>
            <div className="draft-controls">
              <div className="seg">
                {(['ALL', ...POSITIONS] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={`seg-btn ${positionFilter === pos ? 'selected' : ''}`}
                    onClick={() => setPositionFilter(pos)}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              <div className="seg">
                {(
                  [
                    ['overall', 'OVR'],
                    ['salary', 'Salary'],
                    ['pWAR', 'pWAR'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`seg-btn ${sortKey === key ? 'selected' : ''}`}
                    onClick={() => setSortKey(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th className="num">OVR</th>
                <th className="num">Salary</th>
                <th className="num">pWAR</th>
                <th>Traits</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pool.map((player) => {
                const check = runCanDraft(run, player.id);
                return (
                  <tr key={player.id}>
                    <td className="strong">{player.name}</td>
                    <td>{player.position}</td>
                    <td className="num rating">{player.overall}</td>
                    <td className="num">{money(player.salary)}</td>
                    <td className="num">{player.pWAR.toFixed(1)}</td>
                    <td>
                      <TraitTags traits={player.traits} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!check.ok}
                        title={check.ok ? undefined : check.detail}
                        onClick={() => draftPlayer(player.id)}
                      >
                        Draft
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <div className="draft-side">
        <section className="panel">
          <h3>Cap sheet</h3>
          <div className="cap-bar">
            <div
              className={`cap-bar-fill ${space < 0 ? 'over' : ''}`}
              style={{ width: `${Math.min(100, (committed / effectiveCap) * 100)}%` }}
            />
          </div>
          <dl className="kv">
            <div>
              <dt>Effective cap</dt>
              <dd>
                {money(effectiveCap)}
                {capReduction > 0 && <span className="muted"> (−{money(capReduction)})</span>}
              </dd>
            </div>
            <div>
              <dt>Committed</dt>
              <dd>{money(committed)}</dd>
            </div>
            <div>
              <dt>Space</dt>
              <dd className={space < 0 ? 'bad' : 'good'}>{money(space)}</dd>
            </div>
            {slotsLeft > 0 && (
              <div>
                <dt>Reserve for {slotsLeft} open slots</dt>
                <dd>{money(reserveNeeded + MIN_SALARY)}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>
              Roster {draft.roster.length}/{ROSTER_SIZE}
            </h3>
          </div>
          {POSITIONS.map((pos) => {
            const players = draft.roster.filter((p) => p.position === pos);
            const short = players.length < MIN_PER_POSITION;
            return (
              <div key={pos} className="roster-group">
                <div className={`roster-group-head ${short ? 'short' : ''}`}>
                  {pos}{' '}
                  <span className="muted">
                    {players.length}/{MIN_PER_POSITION}+
                  </span>
                </div>
                {players.map((player: Player) => (
                  <div key={player.id} className="roster-row">
                    <span className="rating">{player.overall}</span>
                    <span className="roster-name">{player.name}</span>
                    <span className="muted">{money(player.salary)}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => undraftPlayer(player.id)}
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </section>

        <ChemistryPanel effects={chemistry} delta={chemistryDelta(draft.roster)} />

        <section className="panel">
          {!validation.valid && (
            <ul className="issue-list">
              {validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            disabled={!validation.valid}
            onClick={beginSeason}
          >
            Start season
          </button>
        </section>
      </div>
    </div>
  );
}
