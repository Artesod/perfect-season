import type { ChemistryEffect, ChemistryKind, Player } from '@perfect-season/shared';

/**
 * Chemistry: roster composition produces synergies and anti-synergies that
 * shift team strength. Rules read the playstyle traits assigned at player
 * generation, so drafting is about fit as well as raw overall.
 *
 * Effects scale with season cohesion (0-1): synergies deepen as the team
 * gels, friction (behavioral problems like too-many-cooks) fades and
 * eventually resolves into a positive, structural flaws (no shooting, no
 * defense) persist until the roster changes.
 */

/** Established CPU rosters play as if mostly gelled. */
export const CPU_COHESION = 0.75;
/** At this cohesion, friction effects resolve (flip positive). */
export const FRICTION_RESOLVED_AT = 0.9;

const COHESION_FULL_UNITS = 35;
const COHESION_WIN_UNITS = 1;
const COHESION_LOSS_UNITS = 0.4;
const COHESION_SIGNING_RETENTION = 0.8;

export function cohesionAfterGame(cohesion: number, won: boolean): number {
  const units = won ? COHESION_WIN_UNITS : COHESION_LOSS_UNITS;
  return Math.min(1, cohesion + units / COHESION_FULL_UNITS);
}

/** New pieces re-learn each other: each signing costs 20% of cohesion. */
export function cohesionAfterSigning(cohesion: number): number {
  return cohesion * COHESION_SIGNING_RETENTION;
}

function withTrait(players: readonly Player[], ...traits: string[]): Player[] {
  return players.filter((p) => traits.some((t) => p.traits.includes(t)));
}

const ids = (players: readonly Player[]) => players.map((p) => p.id);

type BaseEffect = Omit<ChemistryEffect, 'kind'>;

interface ChemistryRule {
  kind: ChemistryKind;
  evaluate: (players: readonly Player[]) => BaseEffect | null;
  /** friction only: what the effect becomes once the team has gelled */
  resolve?: (base: BaseEffect) => BaseEffect;
}

const RULES: readonly ChemistryRule[] = [
  // Synergies
  {
    kind: 'synergy',
    evaluate: (players) => {
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
  },
  {
    kind: 'synergy',
    evaluate: (players) => {
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
  },
  {
    kind: 'synergy',
    evaluate: (players) => {
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
  },
  {
    kind: 'synergy',
    evaluate: (players) => {
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
  },
  {
    kind: 'synergy',
    evaluate: (players) => {
      const passers = withTrait(players, 'playmaker', 'point-forward');
      const finishers = withTrait(players, 'lob-threat', 'slasher');
      if (passers.length === 0 || finishers.length === 0) return null;
      return {
        id: 'lob-city',
        label: 'Lob threat: a playmaker throwing to a finisher',
        strengthDelta: 1.5,
        playerIds: ids([passers[0], finishers[0]]),
      };
    },
  },
  {
    kind: 'synergy',
    evaluate: (players) => {
      const wings = players.filter(
        (p) =>
          ['SG', 'SF', 'PF'].includes(p.position) &&
          p.traits.some((t) => t === 'two-way' || t === 'pest-defender'),
      );
      if (wings.length < 3) return null;
      return {
        id: 'switchable',
        label: 'Switchable: wings who guard one through four',
        strengthDelta: 1.5,
        playerIds: ids(wings.slice(0, 3)),
      };
    },
  },
  {
    kind: 'synergy',
    evaluate: (players) => {
      if (players.length < 9) return null;
      const bench = [...players].sort((a, b) => b.overall - a.overall).slice(5, 9);
      const avg = bench.reduce((s, p) => s + p.overall, 0) / bench.length;
      if (avg < 78) return null;
      return {
        id: 'bench-mob',
        label: 'Bench mob: the second unit holds leads',
        strengthDelta: 1,
        playerIds: ids(bench),
      };
    },
  },
  {
    kind: 'synergy',
    evaluate: (players) => {
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
  },
  // Friction: behavioral problems that winning together resolves
  {
    kind: 'friction',
    evaluate: (players) => {
      const dominant = withTrait(players, 'ball-dominant');
      if (dominant.length < 2) return null;
      return {
        id: 'too-many-cooks',
        label: 'Too many cooks: multiple ball-dominant stars',
        strengthDelta: Math.max(-3, -1.5 * (dominant.length - 1)),
        playerIds: ids(dominant),
      };
    },
    resolve: (base) => ({
      id: 'pecking-order',
      label: 'Pecking order established: the stars know their roles',
      strengthDelta: 1,
      playerIds: base.playerIds,
    }),
  },
  // Structural: roster construction flaws that only roster moves fix
  {
    kind: 'structural',
    evaluate: (players) => {
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
  },
  {
    kind: 'structural',
    evaluate: (players) => {
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
  },
  {
    kind: 'structural',
    evaluate: (players) => {
      if (players.length < 8) return null;
      const avgOff = players.reduce((s, p) => s + p.offense, 0) / players.length;
      const avgDef = players.reduce((s, p) => s + p.defense, 0) / players.length;
      if (avgOff - avgDef < 8) return null;
      return {
        id: 'one-way-team',
        label: 'One-way team: nobody gets back on defense',
        strengthDelta: -1.5,
        playerIds: [],
      };
    },
  },
  {
    kind: 'structural',
    evaluate: (players) => {
      const nonShootingBigs = players.filter(
        (p) =>
          (p.position === 'PF' || p.position === 'C') &&
          !p.traits.some((t) => ['sharpshooter', 'stretch-big', 'catch-and-shoot'].includes(t)),
      );
      if (nonShootingBigs.length < 3) return null;
      return {
        id: 'clogged-paint',
        label: 'Clogged paint: three non-shooting bigs',
        strengthDelta: -1.5,
        playerIds: ids(nonShootingBigs.slice(0, 3)),
      };
    },
  },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Chemistry at a given cohesion. Cohesion 0 = brand-new roster (the draft
 * screen); CPU teams pass CPU_COHESION.
 */
export function computeChemistry(players: readonly Player[], cohesion = 0): ChemistryEffect[] {
  const c = Math.min(1, Math.max(0, cohesion));
  const effects: ChemistryEffect[] = [];
  for (const rule of RULES) {
    const base = rule.evaluate(players);
    if (!base) continue;
    if (rule.kind === 'synergy') {
      effects.push({
        ...base,
        kind: 'synergy',
        strengthDelta: round1(base.strengthDelta * (1 + 0.25 * c)),
      });
    } else if (rule.kind === 'structural') {
      effects.push({ ...base, kind: 'structural' });
    } else if (c >= FRICTION_RESOLVED_AT && rule.resolve) {
      effects.push({ ...rule.resolve(base), kind: 'friction' });
    } else {
      effects.push({ ...base, kind: 'friction', strengthDelta: round1(base.strengthDelta * (1 - c)) });
    }
  }
  return effects;
}

/** Net team-strength modifier from all active chemistry effects. */
export function chemistryDelta(players: readonly Player[], cohesion = 0): number {
  return computeChemistry(players, cohesion).reduce((sum, e) => sum + e.strengthDelta, 0);
}
