import { anyPlayerName } from '../format';
import { useGameStore } from '../store';
import './EventCardModal.css';

export function NaggingModal() {
  const run = useGameStore((s) => s.run)!;
  const resolveNagging = useGameStore((s) => s.resolveNagging);

  const pending = run.season?.pendingNagging;
  if (!pending) return null;

  const name = anyPlayerName(run, pending.playerId);
  return (
    <div className="modal-backdrop">
      <div className="modal event-card" role="dialog" aria-modal="true" aria-label="Nagging injury">
        <span className="event-card-kicker">Training room</span>
        <h3>Nagging Injury</h3>
        <p className="event-card-text">
          {name} tweaked something. He says he can play through it, but the trainers want him down.
        </p>
        <div className="event-card-choices">
          <button type="button" className="event-card-choice" onClick={() => resolveNagging('play')}>
            <span className="event-card-choice-label">Let him play through it</span>
            <span className="event-card-choice-effects muted">
              {pending.playHurtDelta} OVR for {pending.playHurtGames} games
            </span>
          </button>
          <button type="button" className="event-card-choice" onClick={() => resolveNagging('sit')}>
            <span className="event-card-choice-label">Sit him until it heals</span>
            <span className="event-card-choice-effects muted">Out {pending.sitGames} games</span>
          </button>
        </div>
      </div>
    </div>
  );
}
