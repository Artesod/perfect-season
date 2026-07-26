import type { ChemistryEffect, Player } from '@perfect-season/shared';

/**
 * Chemistry: roster composition produces synergies and anti-synergies that
 * shift team strength. Rules read the playstyle traits assigned at player
 * generation, so drafting is about fit as well as raw overall.
 */

function withTrait(players: readonly Player[], ...traits: string[]): Player[] {
  return players.filter((p) => traits.some((t) => p.traits.includes(t)));
}

const ids = (players: readonly Player[]) => players.map((p) => p.id);

type ChemistryRule = (players: readonly Player[]) => ChemistryEffect | null;

const RULES: readonly ChemistryRule[] = [
  // Synergies
  (players) => {
    const playmakers = withTrait(players, 'playmaker', 'point-forward');
    const shooters = withTrait(players, 'catch-and-shoot', 'sharpshooter');
    if (playmakers.length >= 1 && shooters.length >= 2) {
      return {
        id: 'floor-general',
        label: 'Floor general: a playmaker feeding spot-up shooters',
        strengthDelta: 2,
        playerIds: ids([playmakers[0], ...shooters.slice(0, 2)]),
      };
    }
    return null;
  },
  (players) => {
    const posts = withTrait(players, 'post-scorer');
    const spacers = withTrait(players, 'stretch-big', 'sharpshooter');
    if (posts.length >= 1 && spacers.length >= 2) {
      return {
        id: 'inside-out',
        label: 'Inside-out: post scoring with shooting around it',
        strengthDelta: 1.5,
        playerIds: ids([posts[0], ...spacers.slice(0, 2)]),
      };
    }
    return null;
  },
  (players) => {
    const anchors = withTrait(players, 'rim-protector');
    const perimeter = withTrait(players, 'pest-defender', 'two-way');
    if (anchors.length >= 1 && perimeter.length >= 1) {
      return {
        id: 'defensive-anchor',
        label: 'Defensive anchor: rim protection behind ball pressure',
        strengthDelta: 1.5,
        playerIds: ids([anchors[0], perimeter[0]]),
      };
    }
    return null;
  },
  (players) => {
    const boards = withTrait(players, 'rebounder');
    if (boards.length >= 2) {
      return {
        id: 'glass-cleaners',
        label: 'Glass cleaners: dominant rebounding duo',
        strengthDelta: 1,
        playerIds: ids(boards.slice(0, 2)),
      };
    }
    return null;
  },
  (players) => {
    // Era pools: teammates from the same historical roster click instantly.
    // Only strict subsets count — an intact era team (every CPU team in era
    // modes) is baseline, its familiarity already priced into the ratings.
    const groups = new Map<string, Player[]>();
    for (const player of players) {
      if (!player.eraTeam) continue;
      const list = groups.get(player.eraTeam) ?? [];
      list.push(player);
      groups.set(player.eraTeam, list);
    }
    let best: { team: string; members: Player[] } | null = null;
    for (const [team, members] of groups) {
      if (members.length < 2 || members.length >= players.length) continue;
      if (
        !best ||
        members.length > best.members.length ||
        (members.length === best.members.length && team < best.team)
      ) {
        best = { team, members };
      }
    }
    if (!best) return null;
    return {
      id: 'ran-it-back',
      label: `Ran it back: ${best.members.length} teammates from the ${best.team}`,
      strengthDelta: Math.min(2, best.members.length - 1),
      playerIds: ids(best.members),
    };
  },
  // Anti-synergies
  (players) => {
    const dominant = withTrait(players, 'ball-dominant');
    if (dominant.length >= 2) {
      return {
        id: 'too-many-cooks',
        label: 'Too many cooks: multiple ball-dominant stars',
        strengthDelta: -1.5 * (dominant.length - 1),
        playerIds: ids(dominant),
      };
    }
    return null;
  },
  (players) => {
    const shooters = withTrait(players, 'sharpshooter', 'catch-and-shoot', 'stretch-big');
    if (players.length >= 8 && shooters.length < 3) {
      return {
        id: 'no-spacing',
        label: 'No spacing: not enough shooting on the roster',
        strengthDelta: -2,
        playerIds: [],
      };
    }
    return null;
  },
  (players) => {
    const rim = withTrait(players, 'rim-protector');
    const defense = withTrait(players, 'pest-defender', 'two-way');
    if (players.length >= 8 && rim.length === 0 && defense.length === 0) {
      return {
        id: 'matador-defense',
        label: 'Matador defense: nobody guards anybody',
        strengthDelta: -2,
        playerIds: [],
      };
    }
    return null;
  },
];

export function computeChemistry(players: readonly Player[]): ChemistryEffect[] {
  return RULES.map((rule) => rule(players)).filter((e): e is ChemistryEffect => e !== null);
}

/** Net team-strength modifier from all active chemistry effects. */
export function chemistryDelta(players: readonly Player[]): number {
  return computeChemistry(players).reduce((sum, e) => sum + e.strengthDelta, 0);
}
