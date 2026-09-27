import { useMemo, useState } from 'react';
import type { Player, Team } from '@perfect-season/shared';
import {
  availableRoster,
  canSign,
  capSpace,
  chemistryDelta,
  computeChemistry,
  CPU_COHESION,
  currentFreeAgents,
  DEAD_CAP_FRACTION,
  runCapReduction,
  effectiveStrength,
  FA_REFRESH_INTERVAL,
  homeWinProbability,
  USER_TEAM_ID,
} from '@perfect-season/sim';
import { ChemistryPanel } from '../components/ChemistryPanel';
import { EventCardModal } from '../components/EventCardModal';
import { EventLine } from '../components/EventLine';
import { NaggingModal } from '../components/NaggingModal';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { PlayerInfoModal } from '../components/PlayerInfoModal';
import { money, pct } from '../format';
import { Term } from '../onboarding/Term';
import { useTour } from '../onboarding/useTour';
import { useGameStore } from '../store';
import './SeasonScreen.css';

const EVENT_LOG_LENGTH = 15;

export function SeasonScreen() {
  const run = useGameStore((s) => s.run)!;
  const runPool = useGameStore((s) => s.runPool);
  const lastGameEvents = useGameStore((s) => s.lastGameEvents);
  const playGame = useGameStore((s) => s.playGame);
  const simToNextEvent = useGameStore((s) => s.simToNextEvent);
  const signFreeAgent = useGameStore((s) => s.signFreeAgent);
  const waivePlayer = useGameStore((s) => s.waivePlayer);

  const [showFreeAgency, setShowFreeAgency] = useState(false);
  const [infoPlayer, setInfoPlayer] = useState<Player | null>(null);
  useTour('season');

  const season = run.season!;
  const gameNumber = season.results.length + 1;
  const capReduction = runCapReduction(run);
  const effectiveDeadCap = season.deadCap + capReduction;
  const pendingCard = season.pendingCard !== null || season.pendingNagging !== null;
  const cohesion = season.cohesion;

  const onCourt = availableRoster(run.roster, season.effects);
  const userTeam: Team = { id: USER_TEAM_ID, name: 'Your Team', players: onCourt };

  const nextGame = season.schedule[season.results.length];
  const opponent = nextGame
    ? run.league.find((t) => t.id === nextGame.opponentTeamId)!
    : null;
  const winProb =
    nextGame && opponent
      ? nextGame.isHome
        ? homeWinProbability(userTeam, opponent, cohesion)
        : 1 - homeWinProbability(opponent, userTeam, CPU_COHESION, cohesion)
      : 0;

  const lastResult = season.results.at(-1);
  const lastOpponentId = lastResult
    ? lastResult.homeTeamId === USER_TEAM_ID
      ? lastResult.awayTeamId
      : lastResult.homeTeamId
    : null;
  const lastOpponent = lastOpponentId
    ? run.league.find((t) => t.id === lastOpponentId)!
    : null;

  const rankings = [userTeam, ...run.league]
    .map((team) => ({ team, strength: effectiveStrength(team) }))
    .sort((a, b) => b.strength - a.strength);

  const freeAgents = useMemo(() => currentFreeAgents(run, runPool ?? undefined), [run, runPool]);
  const gamesUntilRefresh =
    FA_REFRESH_INTERVAL - (season.results.length % FA_REFRESH_INTERVAL);

  const recentEvents = season.events.slice(-EVENT_LOG_LENGTH).reverse();

  return (
    <div className="season">
      <EventCardModal />
      <NaggingModal />
      {infoPlayer && <PlayerInfoModal player={infoPlayer} onClose={() => setInfoPlayer(null)} />}

      <div className="season-topbar panel" data-tour="season-stats">
        <div className="stat-inline">
          <span className="stat-inline-value">
            {run.wins}–{run.losses}
          </span>
          <span className="stat-inline-label">Record</span>
        </div>
        <div className="stat-inline">
          <span className="stat-inline-value">
            {Math.min(gameNumber, season.schedule.length)}/{season.schedule.length}
          </span>
          <span className="stat-inline-label">Game</span>
        </div>
        <div className="stat-inline">
          <span className="stat-inline-value">{run.livesRemaining}</span>
          <span className="stat-inline-label">
            <Term id="lives">{run.livesRemaining === 1 ? 'Life' : 'Lives'}</Term>
          </span>
        </div>
        <div className="stat-inline">
          <span className="stat-inline-value">
            {run.casual ? 'No cap' : money(capSpace(run.roster, effectiveDeadCap))}
          </span>
          <span className="stat-inline-label">
            <Term id="cap-space">Cap space</Term>
          </span>
        </div>
        <div className="season-topbar-actions">
          <button
            type="button"
            className="btn btn-ghost"
            data-tour="season-free-agency"
            onClick={() => setShowFreeAgency((v) => !v)}
          >
            {showFreeAgency ? 'Hide free agency' : 'Free agency'}
          </button>
        </div>
      </div>

      {showFreeAgency && (
        <section className="panel">
          <div className="panel-head">
            <h3>Free agents</h3>
            <span className="muted">
              Pool refreshes in {gamesUntilRefresh} game{gamesUntilRefresh === 1 ? '' : 's'} ·{' '}
              <Term id="dead-cap">dead cap</Term> {money(season.deadCap)}
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th className="num">
                  <Term id="ovr">OVR</Term>
                </th>
                <th className="num">Salary</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {freeAgents.map((player) => {
                const check = canSign(run.roster, player, effectiveDeadCap);
                return (
                  <tr key={player.id}>
                    <td>
                      <span className="player-cell">
                        <PlayerAvatar player={player} size={26} />
                        <span className="strong">{player.name}</span>
                        <button
                          type="button"
                          className="info-btn"
                          title={`About ${player.name}`}
                          onClick={() => setInfoPlayer(player)}
                        >
                          i
                        </button>
                      </span>
                    </td>
                    <td>{player.position}</td>
                    <td className="num rating">{player.overall}</td>
                    <td className="num">{money(player.salary)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!check.ok}
                        title={check.ok ? undefined : check.detail}
                        onClick={() => signFreeAgent(player)}
                      >
                        Sign
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <div className="season-grid">
        <div className="season-main">
          {nextGame && opponent && (
            <section className="panel next-game" data-tour="season-matchup">
              <div className="panel-head">
                <h3>Game {gameNumber}</h3>
                <span className="muted">{nextGame.isHome ? 'Home' : 'Away'}</span>
              </div>
              <div className="matchup">
                <div className="matchup-team">
                  <span className="matchup-name">Your Team</span>
                  <span className="matchup-strength">
                    {effectiveStrength(userTeam, cohesion).toFixed(1)}
                  </span>
                </div>
                <div className="matchup-vs">
                  <span className="matchup-prob good">{pct(winProb)}</span>
                  <span className="muted">
                    <Term id="win-chance">win chance</Term>
                  </span>
                </div>
                <div className="matchup-team">
                  <span className="matchup-name">{opponent.name}</span>
                  <span className="matchup-strength">{effectiveStrength(opponent).toFixed(1)}</span>
                </div>
              </div>
              <div className="next-game-actions" data-tour="season-play">
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  disabled={pendingCard}
                  title={pendingCard ? 'Resolve the pending event first' : undefined}
                  onClick={playGame}
                >
                  Play next game
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={pendingCard}
                  title={pendingCard ? 'Resolve the pending event first' : undefined}
                  onClick={simToNextEvent}
                >
                  Sim to next event
                </button>
              </div>
            </section>
          )}

          {lastResult && lastOpponent && (
            <section className="panel">
              <div className="panel-head">
                <h3>Last game</h3>
                <span
                  className={lastResult.winnerTeamId === USER_TEAM_ID ? 'result-win' : 'result-loss'}
                >
                  {lastResult.winnerTeamId === USER_TEAM_ID ? 'WIN' : 'LOSS'}
                </span>
              </div>
              <div className="box-score">
                <div className="box-score-row">
                  <span>Your Team</span>
                  <span className="box-score-pts">
                    {lastResult.homeTeamId === USER_TEAM_ID
                      ? lastResult.homeScore
                      : lastResult.awayScore}
                  </span>
                </div>
                <div className="box-score-row">
                  <span>{lastOpponent.name}</span>
                  <span className="box-score-pts">
                    {lastResult.homeTeamId === USER_TEAM_ID
                      ? lastResult.awayScore
                      : lastResult.homeScore}
                  </span>
                </div>
              </div>
              <p className="muted small">
                Pre-game win probability:{' '}
                {pct(
                  lastResult.homeTeamId === USER_TEAM_ID
                    ? lastResult.homeWinProbability
                    : 1 - lastResult.homeWinProbability,
                )}
              </p>
              {lastGameEvents.length > 0 && (
                <>
                  <h4>Since last game</h4>
                  <ul className="event-list">
                    {lastGameEvents.map((event, i) => (
                      <EventLine key={i} run={run} event={event} />
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <section className="panel">
            <h3>Schedule</h3>
            <div className="schedule-strip">
              {season.schedule.map((_, i) => {
                const result = season.results[i];
                const state = !result
                  ? 'upcoming'
                  : result.winnerTeamId === USER_TEAM_ID
                    ? 'win'
                    : 'loss';
                return <span key={i} className={`schedule-cell ${state}`} title={`Game ${i + 1}`} />;
              })}
            </div>
          </section>

          <section className="panel" data-tour="season-events">
            <h3>Event log</h3>
            {recentEvents.length === 0 ? (
              <p className="muted">Quiet so far. It won't stay that way.</p>
            ) : (
              <ul className="event-list">
                {recentEvents.map((event, i) => (
                  <EventLine key={i} run={run} event={event} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="season-side">
          <section className="panel" data-tour="season-roster">
            <div className="panel-head">
              <h3>
                Roster <span className="muted">({run.roster.length})</span>
              </h3>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">
                  <Term id="ovr">OVR</Term>
                </th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {run.roster.map((player) => (
                  <RosterRow
                    key={player.id}
                    player={player}
                    injuredGames={season.effects.injuries[player.id]}
                    ratingMod={season.effects.ratingMods[player.id]}
                    onInfo={() => setInfoPlayer(player)}
                    onWaive={() => {
                      const deadCap = (player.salary * DEAD_CAP_FRACTION).toFixed(1);
                      if (
                        window.confirm(
                          `Waive ${player.name}? $${deadCap}M stays on your cap as dead money.`,
                        )
                      ) {
                        waivePlayer(player.id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </section>

          <ChemistryPanel
            effects={computeChemistry(run.roster, cohesion)}
            delta={chemistryDelta(run.roster, cohesion)}
            cohesion={cohesion}
          />

          <section className="panel">
            <h3>
              Power rankings{' '}
              <span className="muted small">
                by <Term id="strength">strength</Term>
              </span>
            </h3>
            <ol className="rankings">
              {rankings.map(({ team, strength }, i) => (
                <li
                  key={team.id}
                  className={`rankings-row ${team.id === USER_TEAM_ID ? 'user' : ''}`}
                >
                  <span className="rankings-rank">{i + 1}</span>
                  <span className="rankings-name">{team.name}</span>
                  <span className="rankings-strength">{strength.toFixed(1)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function RosterRow({
  player,
  injuredGames,
  ratingMod,
  onInfo,
  onWaive,
}: {
  player: Player;
  injuredGames: number | undefined;
  ratingMod: { delta: number; gamesRemaining: number } | undefined;
  onInfo: () => void;
  onWaive: () => void;
}) {
  return (
    <tr className={injuredGames ? 'row-injured' : ''}>
      <td>
        <span className="player-cell">
          <PlayerAvatar player={player} size={26} />
          <span className="strong">{player.name}</span>{' '}
          <span className="muted small">{player.position}</span>
          <button type="button" className="info-btn" title={`About ${player.name}`} onClick={onInfo}>
            i
          </button>
        </span>
      </td>
      <td className="num rating">{player.overall}</td>
      <td>
        {injuredGames ? (
          <span className="status-tag status-injured">Out {injuredGames}g</span>
        ) : ratingMod ? (
          <span className={`status-tag ${ratingMod.delta >= 0 ? 'status-hot' : 'status-cold'}`}>
            {ratingMod.delta > 0 ? '+' : ''}
            {ratingMod.delta} · {ratingMod.gamesRemaining}g
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        <button type="button" className="btn btn-ghost btn-small" onClick={onWaive}>
          Waive
        </button>
      </td>
    </tr>
  );
}
