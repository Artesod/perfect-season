import {
  pick,
  randInt,
  type ActiveEffects,
  type EventCard,
  type InjurySeverity,
  type PendingNagging,
  type Player,
  type Rng,
  type SeasonEvent,
} from '@perfect-season/shared';

/**
 * RNG event engine: rolled between games. Injuries, illnesses, suspensions,
 * streaks/slumps, and revenge boosts apply automatically; morale events
 * surface an authored card and nagging injuries a play/sit decision the
 * player must resolve. All content is data — the engine only rolls and
 * applies, keeping runs deterministic.
 */

export interface EventChances {
  injury: number;
  illness: number;
  suspension: number;
  nagging: number;
  hotStreak: number;
  slump: number;
  morale: number;
}

/** Per-game base probabilities; difficulty modifiers scale these. */
export const BASE_EVENT_CHANCES: EventChances = {
  injury: 0.05,
  illness: 0.03,
  suspension: 0.015,
  nagging: 0.02,
  hotStreak: 0.08,
  slump: 0.06,
  morale: 0.06,
};

export function scaleChances(chances: EventChances, multiplier: number): EventChances {
  return Object.fromEntries(
    Object.entries(chances).map(([key, value]) => [key, value * multiplier]),
  ) as unknown as EventChances;
}

/** Chance a revenge boost fires when a player faces his old team. */
export const REVENGE_CHANCE = 0.25;

export interface EventContext {
  chances?: EventChances;
  cards?: readonly EventCard[];
  /** Active chemistry effects on the roster: id -> producing player ids */
  chemistry?: ReadonlyMap<string, readonly string[]>;
  /** Next game's opponent, for revenge events */
  nextOpponentTeamId?: string;
}

const injuryWeight = (p: Player) =>
  p.traits.includes('iron-man') ? 0.5 : p.traits.includes('injury-prone') ? 2 : 1;
const suspensionWeight = (p: Player) => (p.traits.includes('hot-head') ? 3 : 1);

function weightedPick(
  rng: Rng,
  players: readonly Player[],
  weight: (p: Player) => number,
): Player {
  const total = players.reduce((sum, p) => sum + weight(p), 0);
  let roll = rng() * total;
  for (const p of players) {
    roll -= weight(p);
    if (roll <= 0) return p;
  }
  return players[players.length - 1];
}

function requiredEffectId(card: EventCard): string | null {
  return card.requires?.startsWith('chemistry-effect:')
    ? card.requires.slice('chemistry-effect:'.length)
    : null;
}

function cardEligible(card: EventCard, chemistry: EventContext['chemistry']): boolean {
  const effectId = requiredEffectId(card);
  if (!effectId) return !card.requires;
  // Needs at least two producers: alpha/supporting targets are meaningless
  // for a lone player.
  return (chemistry?.get(effectId)?.length ?? 0) >= 2;
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
 * already sidelined. Morale events fire only when a card pool is provided;
 * cards with `requires` also need the matching chemistry effect active.
 * Roll order is fixed (injury, illness, suspension, nagging, hot-streak,
 * slump, revenge, morale) so seeds stay reproducible.
 */
export function rollEvents(
  availablePlayers: readonly Player[],
  rng: Rng,
  context: EventContext = {},
): SeasonEvent[] {
  if (availablePlayers.length === 0) return [];
  const chances = context.chances ?? BASE_EVENT_CHANCES;
  const events: SeasonEvent[] = [];

  if (rng() < chances.injury) {
    events.push(rollInjury(rng, weightedPick(rng, availablePlayers, injuryWeight).id));
  }
  if (rng() < chances.illness) {
    events.push({
      type: 'illness',
      playerId: weightedPick(rng, availablePlayers, injuryWeight).id,
      gamesOut: randInt(rng, 1, 2),
    });
  }
  if (rng() < chances.suspension) {
    events.push({
      type: 'suspension',
      playerId: weightedPick(rng, availablePlayers, suspensionWeight).id,
      gamesOut: 1,
    });
  }
  if (rng() < chances.nagging) {
    events.push({
      type: 'nagging',
      playerId: pick(rng, availablePlayers).id,
      playHurtDelta: -3,
      playHurtGames: randInt(rng, 5, 8),
      sitGames: randInt(rng, 2, 3),
    });
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
  if (context.nextOpponentTeamId) {
    const returning = availablePlayers.filter(
      (p) => p.originTeamId === context.nextOpponentTeamId,
    );
    if (returning.length > 0 && rng() < REVENGE_CHANCE) {
      events.push({
        type: 'revenge',
        playerId: pick(rng, returning).id,
        ratingDelta: 2,
        gamesRemaining: 1,
      });
    }
  }
  const cards = (context.cards ?? []).filter((c) => cardEligible(c, context.chemistry));
  if (cards.length > 0 && rng() < chances.morale) {
    const card = pick(rng, cards);
    const effectId = requiredEffectId(card);
    let involved: string[];
    if (effectId) {
      const producers = new Set(context.chemistry!.get(effectId)!);
      involved = availablePlayers
        .filter((p) => producers.has(p.id))
        .sort((a, b) => b.overall - a.overall)
        .map((p) => p.id);
    } else {
      const involvedCount = Math.min(randInt(rng, 1, 2), availablePlayers.length);
      involved = [];
      while (involved.length < involvedCount) {
        const candidate = pick(rng, availablePlayers).id;
        if (!involved.includes(candidate)) involved.push(candidate);
      }
    }
    if (involved.length > 0) events.push({ type: 'morale', cardId: card.id, playerIds: involved });
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

/**
 * Fold an auto-applied event into the active effects. Morale cards and
 * nagging injuries are decisions, resolved separately.
 */
export function applyEvent(effects: ActiveEffects, event: SeasonEvent): ActiveEffects {
  switch (event.type) {
    case 'injury':
    case 'illness':
    case 'suspension':
      // Merge with max so two same-game absences can't shorten each other.
      return {
        ...effects,
        injuries: {
          ...effects.injuries,
          [event.playerId]: Math.max(effects.injuries[event.playerId] ?? 0, event.gamesOut),
        },
      };
    case 'hot-streak':
    case 'slump':
    case 'revenge':
      return {
        ...effects,
        ratingMods: mergeRatingMod(
          effects.ratingMods,
          event.playerId,
          event.ratingDelta,
          event.gamesRemaining,
        ),
      };
    case 'nagging':
    case 'morale':
      return effects;
  }
}

/** Apply the play-hurt/sit decision on a nagging injury. */
export function resolveNagging(
  effects: ActiveEffects,
  pending: PendingNagging,
  choice: 'play' | 'sit',
): ActiveEffects {
  if (choice === 'play') {
    return {
      ...effects,
      ratingMods: mergeRatingMod(
        effects.ratingMods,
        pending.playerId,
        pending.playHurtDelta,
        pending.playHurtGames,
      ),
    };
  }
  return {
    ...effects,
    injuries: { ...effects.injuries, [pending.playerId]: pending.sitGames },
  };
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
