import { useEffect, useMemo, useState } from 'react';
import {
  MIN_PER_POSITION,
  MIN_SALARY,
  POSITIONS,
  ROSTER_SIZE,
  SALARY_CAP,
  type Player,
} from '@perfect-season/shared';
import {
  computeChemistry,
  chemistryDelta,
  currentSlot,
  difficultyFor,
  draftCandidates,
  runCanPick,
  runCanReroll,
  totalSalary,
  validateRoster,
} from '@perfect-season/sim';
import { ChemistryPanel } from '../components/ChemistryPanel';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { PlayerInfoModal } from '../components/PlayerInfoModal';
import { TraitTags } from '../components/TraitTags';
import { money } from '../format';
import { useGameStore } from '../store';
import './DraftScreen.css';

/** Tick delays for the slot-machine reel: fast, then decelerating to a stop. */
const REEL_DELAYS = [55, 55, 60, 65, 70, 80, 90, 105, 125, 150, 185, 230, 290] as const;

export function DraftScreen() {
  const run = useGameStore((s) => s.run)!;
  const pickPlayer = useGameStore((s) => s.pickPlayer);
  const rerollTeam = useGameStore((s) => s.rerollTeam);
  const beginSeason = useGameStore((s) => s.beginSeason);

  const draft = run.draft!;
  const capReduction = difficultyFor(run.ascension).capReduction;
  const effectiveCap = SALARY_CAP - capReduction;
  const committed = totalSalary(draft.roster);
  const space = effectiveCap - committed;
  const slotsLeft = ROSTER_SIZE - draft.roster.length;
  const reserveNeeded = Math.max(0, slotsLeft - 1) * MIN_SALARY;

  const round = draft.roster.length + 1;
  const slot = currentSlot(draft);
  const drafting = slot !== null;
  const rolledTeam = run.league.find((t) => t.id === draft.rolledTeamId)!;
  const reroll = runCanReroll(run);

  const validation = validateRoster(draft.roster, capReduction);
  const chemistry = computeChemistry(draft.roster);

  // Only offer players who fit this round's slot (flex rounds show everyone).
  const candidates = useMemo(() => {
    const offered = draftCandidates(draft, run.league).filter(
      (p) => slot === 'flex' || p.position === slot,
    );
    return offered.sort((a, b) => b.overall - a.overall);
  }, [draft, run.league, slot]);

  // Slot-machine reel: purely presentational — the rolled team is already
  // decided in state; we just cycle names before revealing it. Keyed on
  // rollIndex so every pick and reroll spins again.
  const [reel, setReel] = useState({ name: rolledTeam.name, spinning: false });
  const [infoPlayer, setInfoPlayer] = useState<Player | null>(null);
  useEffect(() => {
    if (!drafting) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReel({ name: rolledTeam.name, spinning: false });
      return;
    }
    const names = run.league.map((t) => t.name);
    const timeouts: number[] = [];
    let i = Math.floor(Math.random() * names.length);
    let elapsed = 0;
    setReel({ name: names[i], spinning: true });
    for (const delay of REEL_DELAYS) {
      elapsed += delay;
      i += 1;
      const name = names[i % names.length];
      timeouts.push(window.setTimeout(() => setReel({ name, spinning: true }), elapsed));
    }
    timeouts.push(
      window.setTimeout(
        () => setReel({ name: rolledTeam.name, spinning: false }),
        elapsed + 320,
      ),
    );
    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.rollIndex]);
  const spinning = drafting && reel.spinning;

  return (
    <div className="draft">
      <div className="draft-main">
        <section className="panel">
          <div className="panel-head">
            <h3>
              {drafting ? (
                <>
                  Round {round} of {ROSTER_SIZE} —{' '}
                  {slot === 'flex' ? 'flex pick (any position)' : `draft a ${slot}`}
                </>
              ) : (
                'Draft complete'
              )}
            </h3>
            {drafting && (
              <button
                type="button"
                className={`btn btn-small ${reroll.free && !spinning ? 'btn-primary' : ''}`}
                disabled={!reroll.allowed || spinning}
                title={
                  reroll.allowed
                    ? undefined
                    : 'No reroll tokens left — pick from the rolled team'
                }
                onClick={rerollTeam}
              >
                {reroll.free && !spinning
                  ? 'Free reroll (no legal pick)'
                  : `Reroll team (${draft.rerollsLeft} left)`}
              </button>
            )}
          </div>

          <div className="slot-strip">
            {draft.slots.map((s, i) => {
              const filled = draft.roster[i];
              const state = filled ? 'filled' : i === draft.roster.length ? 'current' : 'pending';
              return (
                <div
                  key={i}
                  className={`slot-chip ${state}`}
                  title={filled ? filled.name : undefined}
                >
                  {s === 'flex' ? 'FLX' : s}
                </div>
              );
            })}
          </div>
        </section>

        {drafting && (
          <section className="panel">
            <div className={`team-reel ${spinning ? 'spinning' : 'landed'}`}>
              <span className="team-reel-label">{spinning ? 'Rolling' : 'You rolled'}</span>
              <span key={`${draft.rollIndex}-${reel.name}`} className="team-reel-name">
                {reel.name}
              </span>
            </div>

            {spinning ? (
              <div className="reel-wait muted">Spinning up the next roster…</div>
            ) : candidates.length === 0 ? (
              <div className="reel-empty">
                No {slot === 'flex' ? 'players' : `${slot}s`} left on this roster — the reroll is
                free.
              </div>
            ) : (
              <>
                {reroll.free && (
                  <div className="reel-empty">
                    None of these players fit under the cap — the reroll is free.
                  </div>
                )}
                <div className="candidate-grid" key={draft.rollIndex}>
                  {candidates.map((player, idx) => {
                    const check = runCanPick(run, player.id);
                    return (
                      <div
                        key={player.id}
                        className={`candidate-card ${check.ok ? '' : 'blocked'}`}
                        style={{ animationDelay: `${idx * 45}ms` }}
                      >
                        <div className="candidate-top">
                          <PlayerAvatar player={player} size={44} />
                          <div className="candidate-id">
                            <span className="candidate-name">{player.name}</span>
                            <span className="candidate-meta">
                              {player.position} · {money(player.salary)} ·{' '}
                              {player.pWAR.toFixed(1)} pWAR
                            </span>
                          </div>
                          <span className="candidate-ovr rating">{player.overall}</span>
                          <button
                            type="button"
                            className="info-btn"
                            title={`About ${player.name}`}
                            onClick={() => setInfoPlayer(player)}
                          >
                            i
                          </button>
                        </div>
                        <TraitTags traits={player.traits} />
                        <button
                          type="button"
                          className="btn btn-small btn-block"
                          disabled={!check.ok}
                          title={check.ok ? undefined : check.detail}
                          onClick={() => pickPlayer(player.id)}
                        >
                          Pick
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}
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
                    <PlayerAvatar player={player} size={24} />
                    <span className="rating">{player.overall}</span>
                    <span className="roster-name">{player.name}</span>
                    <span className="muted">{money(player.salary)}</span>
                    <button
                      type="button"
                      className="info-btn"
                      title={`About ${player.name}`}
                      onClick={() => setInfoPlayer(player)}
                    >
                      i
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

      {infoPlayer && <PlayerInfoModal player={infoPlayer} onClose={() => setInfoPlayer(null)} />}
    </div>
  );
}
