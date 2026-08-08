import type { CardEffect } from '@perfect-season/shared';
import { EVENT_CARDS } from '../cards';
import { anyPlayerName, fillCardText } from '../format';
import { useGameStore } from '../store';
import './EventCardModal.css';

function describeEffect(effect: CardEffect): string | null {
  if (effect.type === 'none') return null;
  if (effect.type === 'cohesion') {
    return effect.delta > 0 ? 'Team gels faster' : 'Team chemistry takes a hit';
  }
  const who =
    effect.target === 'team'
      ? 'whole team'
      : effect.target === 'alpha'
        ? 'your best player involved'
        : effect.target === 'supporting'
          ? 'the other involved players'
          : 'involved player(s)';
  if (effect.type === 'absence') {
    return `${who} sit${effect.target === 'alpha' ? 's' : ''} ${effect.games} game${effect.games === 1 ? '' : 's'}`;
  }
  const sign = effect.delta > 0 ? '+' : '';
  return `${sign}${effect.delta} OVR to ${who} for ${effect.games} games`;
}

export function EventCardModal() {
  const run = useGameStore((s) => s.run)!;
  const resolveCard = useGameStore((s) => s.resolveCard);

  const pending = run.season?.pendingCard;
  if (!pending) return null;

  const card = EVENT_CARDS.find((c) => c.id === pending.cardId);
  if (!card) return null;

  const names = pending.playerIds.map((id) => anyPlayerName(run, id));

  return (
    <div className="modal-backdrop">
      <div className="modal event-card" role="dialog" aria-modal="true" aria-label={card.title}>
        <span className="event-card-kicker">Locker room</span>
        <h3>{card.title}</h3>
        <p className="event-card-text">{fillCardText(card.text, names)}</p>
        <div className="event-card-choices">
          {card.choices.map((choice) => {
            const summaries = choice.effects
              .map(describeEffect)
              .filter((s): s is string => s !== null);
            return (
              <button
                key={choice.id}
                type="button"
                className="event-card-choice"
                onClick={() => resolveCard(choice.id)}
              >
                <span className="event-card-choice-label">{choice.label}</span>
                <span className="event-card-choice-effects muted">
                  {summaries.length > 0 ? summaries.join(' · ') : 'No effect'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
