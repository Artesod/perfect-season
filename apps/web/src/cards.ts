import type { EventCard } from '@perfect-season/shared';
import rawCards from '../../../data/event-cards.json';

/**
 * The authored event-card pool, bundled at build time. Content is validated
 * by the sim package's content tests, so a plain cast is safe here.
 */
export const EVENT_CARDS = rawCards as unknown as EventCard[];
