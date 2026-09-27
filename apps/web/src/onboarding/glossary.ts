import { MIN_PER_POSITION, MIN_SALARY, SALARY_CAP } from '@perfect-season/shared';
import {
  CASUAL_CPU_REDUCTION,
  CASUAL_LIVES,
  DEAD_CAP_FRACTION,
  REROLL_TOKENS,
  difficultyFor,
  runLives,
} from '@perfect-season/sim';
import { money } from '../format';

export type TermId =
  | 'pg'
  | 'sg'
  | 'sf'
  | 'pf'
  | 'c'
  | 'ovr'
  | 'offense'
  | 'defense'
  | 'pwar'
  | 'ppg'
  | 'rpg'
  | 'apg'
  | 'spg'
  | 'bpg'
  | 'mpg'
  | 'fg-pct'
  | 'three-pct'
  | 'gp'
  | 'salary-cap'
  | 'effective-cap'
  | 'committed'
  | 'cap-space'
  | 'dead-cap'
  | 'reserve'
  | 'seed'
  | 'ascension'
  | 'lives'
  | 'casual'
  | 'reroll-tokens'
  | 'badges'
  | 'chemistry'
  | 'cohesion'
  | 'synergy'
  | 'friction'
  | 'structural'
  | 'strength'
  | 'win-chance'
  | 'traits';

export type TermGroup = 'Positions' | 'Ratings' | 'Stats' | 'Cap' | 'Run' | 'Team';

export interface GlossaryEntry {
  label: string;
  group: TermGroup;
  /** One or two sentences, shown in the inline popover. */
  short: string;
  /** Extra detail, shown only in the glossary panel. */
  long?: string;
}

const STANDARD_LIVES = runLives(0, false);
const MAX_CAP_CUT = difficultyFor(5).capReduction;
const DEAD_CAP_PCT = Math.round(DEAD_CAP_FRACTION * 100);

const perGame = (what: string): string =>
  `${what} per game, from the player's last real NBA season. Shown for reference only — the sim does not use it.`;

export const GLOSSARY: Record<TermId, GlossaryEntry> = {
  pg: {
    label: 'PG',
    group: 'Positions',
    short: `Point guard — the primary ball handler. Your roster needs at least ${MIN_PER_POSITION}.`,
  },
  sg: {
    label: 'SG',
    group: 'Positions',
    short: `Shooting guard. Your roster needs at least ${MIN_PER_POSITION}.`,
  },
  sf: {
    label: 'SF',
    group: 'Positions',
    short: `Small forward. Your roster needs at least ${MIN_PER_POSITION}.`,
  },
  pf: {
    label: 'PF',
    group: 'Positions',
    short: `Power forward. Your roster needs at least ${MIN_PER_POSITION}.`,
  },
  c: {
    label: 'C',
    group: 'Positions',
    short: `Center — usually the tallest player. Your roster needs at least ${MIN_PER_POSITION}.`,
  },
  ovr: {
    label: 'OVR (Overall)',
    group: 'Ratings',
    short:
      'A player’s overall rating, roughly 40–99. It is the number that decides games: team strength is built from it.',
    long: 'Salary and pWAR are derived from overall. Event cards, streaks, and playing hurt can raise or lower it for a few games.',
  },
  offense: {
    label: 'Offense',
    group: 'Ratings',
    short: 'Overall adjusted toward scoring (up to 6 points above or below overall).',
    long: 'It does not change win chance directly. A roster that is far better on offense than defense gets the “one-way team” chemistry penalty.',
  },
  defense: {
    label: 'Defense',
    group: 'Ratings',
    short: 'Overall adjusted toward defending (up to 6 points above or below overall).',
    long: 'Like Offense, it matters through chemistry, not through win chance directly.',
  },
  pwar: {
    label: 'pWAR',
    group: 'Ratings',
    short:
      'Projected wins above replacement: roughly how many extra wins a player adds over a minimum-salary backup. Higher is better.',
    long: 'Calculated from overall. It is a guide for comparing picks; the sim itself uses overall.',
  },
  ppg: { label: 'PPG', group: 'Stats', short: perGame('Points') },
  rpg: { label: 'RPG', group: 'Stats', short: perGame('Rebounds') },
  apg: { label: 'APG', group: 'Stats', short: perGame('Assists') },
  spg: { label: 'SPG', group: 'Stats', short: perGame('Steals') },
  bpg: { label: 'BPG', group: 'Stats', short: perGame('Blocks') },
  mpg: { label: 'MPG', group: 'Stats', short: perGame('Minutes played') },
  'fg-pct': {
    label: 'FG%',
    group: 'Stats',
    short:
      "Field-goal percentage: share of shots made, from the player's last real NBA season. Reference only.",
  },
  'three-pct': {
    label: '3P%',
    group: 'Stats',
    short:
      "Three-point percentage: share of three-point shots made, from the player's last real NBA season. Reference only.",
  },
  gp: {
    label: 'GP',
    group: 'Stats',
    short: "Games played in the player's last real NBA season. Reference only.",
  },
  'salary-cap': {
    label: 'Salary cap',
    group: 'Cap',
    short: `The most your roster's salaries can add up to: ${money(SALARY_CAP)}. Higher ascension levels shrink it.`,
  },
  'effective-cap': {
    label: 'Effective cap',
    group: 'Cap',
    short: `Your actual cap for this run: ${money(SALARY_CAP)} minus the ascension cut (up to ${money(MAX_CAP_CUT)}). Casual runs have no cap.`,
  },
  committed: {
    label: 'Committed',
    group: 'Cap',
    short: 'Total salary of the players you have drafted so far.',
  },
  'cap-space': {
    label: 'Cap space',
    group: 'Cap',
    short:
      'How much salary you can still add: effective cap minus committed salary minus dead cap. You need space to sign free agents.',
  },
  'dead-cap': {
    label: 'Dead cap',
    group: 'Cap',
    short: `Waiving a player leaves ${DEAD_CAP_PCT}% of his salary on your cap for the rest of the run. Also called dead money.`,
  },
  reserve: {
    label: 'Reserve',
    group: 'Cap',
    short: `Money you must keep for open roster slots: ${money(MIN_SALARY)} (the league minimum) per slot. A pick that eats into it is blocked.`,
  },
  seed: {
    label: 'Seed',
    group: 'Run',
    short:
      'A number that decides every random roll in a run. Same seed, ascension, and player pool gives the same run — share it to race friends.',
  },
  ascension: {
    label: 'Ascension',
    group: 'Run',
    short:
      'Difficulty level 0–5. Winning a standard run at a level unlocks the next one.',
    long: `Each level makes CPU teams better, events more frequent, and (from level 2) cuts the salary cap, up to ${money(MAX_CAP_CUT)} at level 5.`,
  },
  lives: {
    label: 'Lives',
    group: 'Run',
    short: `Each loss costs one life. Lose your last life and the run ends. Standard runs get ${STANDARD_LIVES}; casual runs get ${CASUAL_LIVES}.`,
  },
  casual: {
    label: 'Casual',
    group: 'Run',
    short: `A relaxed cap style: no salary cap, CPU teams ${CASUAL_CPU_REDUCTION} overall weaker, and ${CASUAL_LIVES} lives.`,
    long: 'Casual runs count in career stats but earn no badges, unlock no ascension levels, and never reach the leaderboard.',
  },
  'reroll-tokens': {
    label: 'Reroll tokens',
    group: 'Run',
    short: `You get ${REROLL_TOKENS} per draft. Spend one to swap the rolled team for a different one. Rerolls are free when no player on the rolled team can be picked.`,
  },
  badges: {
    label: 'Badges',
    group: 'Run',
    short:
      'Career achievements, such as finishing a run or winning 70+ games. Only standard runs earn them.',
  },
  chemistry: {
    label: 'Chemistry',
    group: 'Team',
    short:
      'Bonuses and penalties to team strength from how your players’ traits fit together.',
    long: 'Effects are synergy (grows as the team gels), friction (fades as the team gels), or structural (only roster moves fix it).',
  },
  cohesion: {
    label: 'Cohesion',
    group: 'Team',
    short:
      'How well your roster has gelled, from 0% to 100%. It rises with every game (more with wins) and drops when you sign free agents.',
    long: 'Higher cohesion boosts synergy and shrinks friction. CPU teams are fixed at 75%.',
  },
  synergy: {
    label: 'Synergy',
    group: 'Team',
    short: 'A chemistry bonus from traits that work well together. It grows a little as cohesion rises.',
  },
  friction: {
    label: 'Friction',
    group: 'Team',
    short:
      'A chemistry penalty that fades as cohesion rises, and turns into a bonus once the team fully gels. Winning resolves it.',
  },
  structural: {
    label: 'Structural',
    group: 'Team',
    short:
      'A chemistry penalty from roster construction. It never fades — only signing or waiving players fixes it.',
  },
  strength: {
    label: 'Strength',
    group: 'Team',
    short:
      'A team’s power rating: a weighted average of its top 10 players’ overall (best players count most), plus chemistry.',
  },
  'win-chance': {
    label: 'Win chance',
    group: 'Team',
    short:
      'Your odds of winning the next game, from the strength gap between the teams. Home teams get a small edge.',
  },
  traits: {
    label: 'Traits',
    group: 'Team',
    short:
      'Playstyle tags such as sharpshooter or post-scorer. They create chemistry effects, and some change injury or suspension odds.',
  },
};

/** Terms whose label or definition contains the query, sorted by label. */
export function searchGlossary(query: string): TermId[] {
  const needle = query.trim().toLowerCase();
  return (Object.keys(GLOSSARY) as TermId[])
    .filter((id) => {
      if (!needle) return true;
      const { label, short, long } = GLOSSARY[id];
      return [label, short, long ?? ''].some((text) => text.toLowerCase().includes(needle));
    })
    .sort((a, b) => GLOSSARY[a].label.localeCompare(GLOSSARY[b].label));
}
