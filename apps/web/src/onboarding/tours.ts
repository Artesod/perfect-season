import type { RunState } from '@perfect-season/shared';
import type { TourId } from './onboardingStore';

export interface TourStep {
  /** Value of the `data-tour` attribute on the element to highlight. */
  target: string;
  title: string;
  body: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export const TOURS: Record<TourId, TourStep[]> = {
  home: [
    {
      target: 'home-hero',
      title: 'Welcome to Perfect Season',
      body: 'Draft a 15-man roster under the salary cap, then play the whole season. Every loss costs a life — run out and the run is over.',
    },
    {
      target: 'home-pool',
      title: 'Pick your player pool',
      body: 'Choose who you draft from: today’s NBA, classic seasons, all-time rosters, a mix of all three, or a fictional league.',
    },
    {
      target: 'home-ascension',
      title: 'Ascension = difficulty',
      side: 'right',
      body: 'Start at 0. Winning a run unlocks the next level, with tougher CPU teams, more events, and a smaller cap.',
    },
    {
      target: 'home-cap-style',
      title: 'Standard or Casual',
      side: 'right',
      body: 'Standard is the real challenge. Casual removes the cap and gives extra lives, but earns no badges or leaderboard spots.',
    },
    {
      target: 'home-start',
      title: 'Start your run',
      side: 'right',
      body: 'Ready? Start the run to begin the draft. Tap the ? button in the header any time to replay this tour or open the glossary.',
    },
  ],
  draft: [
    {
      target: 'draft-reel',
      title: 'Each round rolls a team',
      body: 'Every round, a random NBA team is rolled. You pick one player from that team’s roster.',
    },
    {
      target: 'draft-candidate',
      title: 'Choose a player',
      body: 'Compare overall (the big number), salary, and pWAR. Tap i for stats. Players with two positions let you choose which slot they fill.',
    },
    {
      target: 'draft-reroll',
      title: 'Don’t like the team?',
      body: 'Reroll to roll a different team. Tokens are limited, so save them for bad rolls.',
    },
    {
      target: 'draft-slots',
      title: 'Fill every position',
      body: 'You need at least 2 players at each position. Highlighted chips show positions you still have to cover before the draft ends.',
    },
    {
      target: 'draft-cap',
      title: 'Watch the cap',
      body: 'Your salaries must fit under the cap, with enough left to fill every open slot at the league minimum.',
      side: 'left',
    },
    {
      target: 'draft-chemistry',
      title: 'Chemistry',
      body: 'Player traits combine into bonuses or penalties to team strength. Hover any underlined term for its meaning.',
      side: 'left',
    },
  ],
  season: [
    {
      target: 'season-stats',
      title: 'Your season at a glance',
      body: 'Record, games played, lives left, and cap space. Lose all your lives and the run ends.',
    },
    {
      target: 'season-matchup',
      title: 'Next matchup',
      body: 'Compare team strength and your win chance before each game.',
    },
    {
      target: 'season-play',
      title: 'Play or sim',
      body: 'Play one game at a time, or sim ahead until the next decision comes up.',
    },
    {
      target: 'season-events',
      title: 'Events',
      body: 'Injuries, hot streaks, and locker-room drama show up here. Some events ask you to choose — each choice has trade-offs.',
    },
    {
      target: 'season-free-agency',
      title: 'Free agency',
      body: 'Sign free agents if you have an open roster spot and cap space. New signings lower cohesion for a while.',
    },
    {
      target: 'season-roster',
      title: 'Your roster',
      body: 'Check injuries and streaks. Waiving a player frees a spot but leaves half his salary on your cap as dead cap.',
      side: 'left',
    },
  ],
};

/** Which screen tour belongs to a run status; null = no tour (summary screen). */
export function tourForStatus(status: RunState['status'] | null): TourId | null {
  switch (status) {
    case null:
      return 'home';
    case 'drafting':
      return 'draft';
    case 'in-season':
    case 'playoffs':
      return 'season';
    case 'won':
    case 'lost':
      return null;
  }
}
