import type { RunState, SeasonEvent } from '@perfect-season/shared';
import { anyPlayerName } from '../format';

const SEVERITY_LABEL = { minor: 'Minor', moderate: 'Moderate', severe: 'Severe' } as const;

function describeEvent(run: RunState, event: SeasonEvent): string {
  switch (event.type) {
    case 'injury':
      return `${SEVERITY_LABEL[event.severity]} injury: ${anyPlayerName(run, event.playerId)} out ${event.gamesOut} game${event.gamesOut === 1 ? '' : 's'}`;
    case 'hot-streak':
      return `${anyPlayerName(run, event.playerId)} is heating up (+${event.ratingDelta} for ${event.gamesRemaining} games)`;
    case 'slump':
      return `${anyPlayerName(run, event.playerId)} hit a slump (${event.ratingDelta} for ${event.gamesRemaining} games)`;
    case 'illness':
      return `${anyPlayerName(run, event.playerId)} is under the weather — out ${event.gamesOut} game${event.gamesOut === 1 ? '' : 's'}`;
    case 'suspension':
      return `${anyPlayerName(run, event.playerId)} suspended ${event.gamesOut} game${event.gamesOut === 1 ? '' : 's'}`;
    case 'revenge':
      return `${anyPlayerName(run, event.playerId)} circled this one — facing his old team (+${event.ratingDelta})`;
    case 'nagging':
      return `${anyPlayerName(run, event.playerId)} is nursing a nagging injury — decision needed`;
    case 'morale':
      return `Locker room: ${event.playerIds.map((id) => anyPlayerName(run, id)).join(', ')} involved in an incident`;
  }
}

const EVENT_ICON: Record<SeasonEvent['type'], string> = {
  injury: '🩹',
  'hot-streak': '🔥',
  slump: '🧊',
  illness: '🤒',
  suspension: '🚫',
  revenge: '😤',
  nagging: '🦵',
  morale: '💬',
};

export function EventLine({ run, event }: { run: RunState; event: SeasonEvent }) {
  return (
    <li className={`event-line event-${event.type}`}>
      <span className="event-icon">{EVENT_ICON[event.type]}</span>
      <span>{describeEvent(run, event)}</span>
    </li>
  );
}
