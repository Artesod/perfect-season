import {
  pick,
  randInt,
  type ActiveEffects,
  type EventCard,
  type InjurySeverity,
  type Player,
  type Rng,
  type SeasonEvent,
} from '@perfect-season/shared';

/**
 * RNG event engine: rolled between games. Injuries/streaks/slumps apply
 * automatically; morale events surface an authored card the player must
 * resolve with a choice. All content is data — the engine only rolls and
 * applies, keeping runs deterministic.
 */

export interface EventChances {
  injury: number;
  hotStreak: number;
  slump: number;
  morale: number;
}

/** Per-game base probabilities; difficulty modifiers scale these. */
export const BASE_EVENT_CHANCES: EventChances = {
  injury: 0.05,
  hotStreak: 0.08,
  slump: 0.06,
  morale: 0.06,
};

export function scaleChances(chances: EventChances, multiplier: number): EventChances {
  return {
    injury: chances.injury * multiplier,
    hotStreak: chances.hotStreak * multiplier,
    slump: chances.slump * multiplier,
    morale: chances.morale * multiplier,
  };
}

const INJURY_TABLE: readonly {
  severity: InjurySeverity;
  weight: number;
  min: number;
  max: number;
}[] = [
  { severity: 'minor', weight: 0.6, min: 1, max: 3 },
  { severity: 'moderate', weight: 0.3, min: 4, max: 10 },
  { severity: 'severe', weight: 0.1, min: 15, max: 40 },
];

function rollInjury(rng: Rng, playerId: string): SeasonEvent {
  const roll = rng();
  let cumulative = 0;
  for (const tier of INJURY_TABLE) {
    cumulative += tier.weight;
    if (roll < cumulative) {
      return {
        type: 'injury',
        playerId,
        severity: tier.severity,
        gamesOut: randInt(rng, tier.min, tier.max),
      };
    }
  }
  const last = INJURY_TABLE[INJURY_TABLE.length - 1];
  return { type: 'injury', playerId, severity: last.severity, gamesOut: last.min };
}

/**
 * Roll the between-game events. `availablePlayers` should exclude anyone
 * already injured. Morale events fire only when a card pool is provided.
 */
export function rollEvents(
  availablePlayers: readonly Player[],
  rng: Rng,
  chances: EventChances = BASE_EVENT_CHANCES,
  cards: readonly EventCard[] = [],
): SeasonEvent[] {
  if (availablePlayers.length === 0) return [];
  const events: SeasonEvent[] = [];

  if (rng() < chances.injury) {
    events.push(rollInjury(rng, pick(rng, availablePlayers).id));
  }
  if (rng() < chances.hotStreak) {
    events.push({
      type: 'hot-streak',
      playerId: pick(rng, availablePlayers).id,
      ratingDelta: randInt(rng, 2, 5),
      gamesRemaining: randInt(rng, 3, 8),
    });
  }
  if (rng() < chances.slump) {
    events.push({
      type: 'slump',
      playerId: pick(rng, availablePlayers).id,
      ratingDelta: -randInt(rng, 2, 5),
      gamesRemaining: randInt(rng, 3, 8),
    });
  }
  if (cards.length > 0 && rng() < chances.morale) {
    const card = pick(rng, cards);
    const involvedCount = Math.min(randInt(rng, 1, 2), availablePlayers.length);
    const involved: string[] = [];
    while (involved.length < involvedCount) {
      const candidate = pick(rng, availablePlayers).id;
      if (!involved.includes(candidate)) involved.push(candidate);
    }
    events.push({ type: 'morale', cardId: card.id, playerIds: involved });
  }
  return events;
}

export function emptyActiveEffects(): ActiveEffects {
  return { injuries: {}, ratingMods: {} };
}

function mergeRatingMod(
  mods: ActiveEffects['ratingMods'],
  playerId: string,
  delta: number,
  games: number,
): ActiveEffects['ratingMods'] {
  const existing = mods[playerId];
  return {
    ...mods,
    [playerId]: existing
      ? { delta: existing.delta + delta, gamesRemaining: Math.max(existing.gamesRemaining, games) }
      : { delta, gamesRemaining: games },
  };
}

/** Fold an auto-applied event into the active effects. Morale cards are resolved separately. */
export function applyEvent(effects: ActiveEffects, event: SeasonEvent): ActiveEffects {
  switch (event.type) {
    case 'injury':
      return { ...effects, injuries: { ...effects.injuries, [event.playerId]: event.gamesOut } };
    case 'hot-streak':
    case 'slump':
      return {
        ...effects,
        ratingMods: mergeRatingMod(
          effects.ratingMods,
          event.playerId,
          event.ratingDelta,
          event.gamesRemaining,
        ),
      };
    case 'illness':
    case 'suspension':
    case 'revenge':
    case 'nagging':
    case 'morale':
      return effects;
  }
}

/** Apply the player's choice on a morale card. */
export function resolveCardChoice(
  effects: ActiveEffects,
  card: EventCard,
  choiceId: string,
  involvedPlayerIds: readonly string[],
  rosterPlayerIds: readonly string[],
): ActiveEffects {
  const choice = card.choices.find((c) => c.id === choiceId);
  if (!choice) {
    throw new Error(`Card ${card.id} has no choice ${choiceId}`);
  }
  let next = effects;
  for (const effect of choice.effects) {
    if (effect.type !== 'rating') continue;
    const targets = effect.target === 'involved' ? involvedPlayerIds : rosterPlayerIds;
    for (const playerId of targets) {
      next = {
        ...next,
        ratingMods: mergeRatingMod(next.ratingMods, playerId, effect.delta, effect.games),
      };
    }
  }
  return next;
}

/** Count down one game: injuries heal, streaks and slumps fade. */
export function tickEffects(effects: ActiveEffects): ActiveEffects {
  const injuries: ActiveEffects['injuries'] = {};
  for (const [playerId, gamesOut] of Object.entries(effects.injuries)) {
    if (gamesOut > 1) injuries[playerId] = gamesOut - 1;
  }
  const ratingMods: ActiveEffects['ratingMods'] = {};
  for (const [playerId, mod] of Object.entries(effects.ratingMods)) {
    if (mod.gamesRemaining > 1) {
      ratingMods[playerId] = { delta: mod.delta, gamesRemaining: mod.gamesRemaining - 1 };
    }
  }
  return { injuries, ratingMods };
}

/** The roster that actually takes the floor: injured players out, modifiers applied. */
export function availableRoster(players: readonly Player[], effects: ActiveEffects): Player[] {
  return players
    .filter((p) => !(p.id in effects.injuries))
    .map((p) => {
      const mod = effects.ratingMods[p.id];
      if (!mod) return p;
      const clamp = (n: number) => Math.min(99, Math.max(40, n));
      return {
        ...p,
        overall: clamp(p.overall + mod.delta),
        offense: clamp(p.offense + mod.delta),
        defense: clamp(p.defense + mod.delta),
      };
    });
}

/** Structural validation for authored card content in data/. */
export function validateEventCards(cards: readonly EventCard[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (!card.id) errors.push('Card with missing id');
    if (seen.has(card.id)) errors.push(`Duplicate card id: ${card.id}`);
    seen.add(card.id);
    if (!card.title || !card.text) errors.push(`Card ${card.id}: missing title or text`);
    if (!Array.isArray(card.choices) || card.choices.length < 2) {
      errors.push(`Card ${card.id}: needs at least 2 choices`);
      continue;
    }
    const choiceIds = new Set<string>();
    for (const choice of card.choices) {
      if (!choice.id || !choice.label) {
        errors.push(`Card ${card.id}: choice missing id or label`);
        continue;
      }
      if (choiceIds.has(choice.id)) errors.push(`Card ${card.id}: duplicate choice ${choice.id}`);
      choiceIds.add(choice.id);
      for (const effect of choice.effects) {
        if (effect.type === 'rating') {
          if (effect.delta === 0) errors.push(`Card ${card.id}/${choice.id}: rating delta of 0`);
          if (effect.games < 1) errors.push(`Card ${card.id}/${choice.id}: games must be >= 1`);
          if (effect.target !== 'involved' && effect.target !== 'team') {
            errors.push(`Card ${card.id}/${choice.id}: bad target`);
          }
        } else if (effect.type !== 'none') {
          errors.push(`Card ${card.id}/${choice.id}: unknown effect type`);
        }
      }
    }
  }
  return errors;
}
