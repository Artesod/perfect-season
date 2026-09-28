import type { RunState } from '@perfect-season/shared';
import { runLives } from '@perfect-season/sim';
import type { PoolChoice } from './challengeLink';

export type FinishedRunSummary = Pick<
  RunState,
  'seed' | 'ascension' | 'casual' | 'wins' | 'losses' | 'livesRemaining' | 'status'
>;

export const POOL_LABELS: Record<PoolChoice, string> = {
  current: 'Current NBA',
  classic: 'Classic eras',
  'all-time': 'All-Time',
  mixed: 'Mixed',
  procedural: 'Fictional',
};

function record(run: FinishedRunSummary): string {
  return `${run.wins}–${run.losses}`;
}

export function runHeadline(run: FinishedRunSummary): { kicker: string; headline: string } {
  const kicker =
    run.status === 'won' ? (run.losses === 0 ? 'Perfect season' : 'Season survived') : 'Run over';
  return { kicker, headline: record(run) };
}

export function runTags(run: FinishedRunSummary, pool: PoolChoice): string[] {
  const lives = runLives(run.ascension, run.casual);
  const tags = [`Asc ${run.ascension}`, POOL_LABELS[pool]];
  if (run.casual) tags.push('Casual');
  if (lives > 1) {
    const used = Math.min(lives, lives - Math.max(0, run.livesRemaining));
    tags.push(`Lives used ${used}/${lives}`);
  }
  return tags;
}

/** One-line brag without the link; callers append the challenge URL */
export function buildShareText(run: FinishedRunSummary): string {
  const where = `Asc ${run.ascension} · seed ${run.seed}${run.casual ? ' · casual' : ''}`;
  if (run.status === 'won' && run.losses === 0) {
    return `Went 82–0 in Perfect Season 🏆 ${where}. Can you beat it?`;
  }
  const lead =
    run.status === 'won'
      ? `Survived the season at ${record(run)} in Perfect Season`
      : `Made it to ${record(run)} in Perfect Season`;
  return `${lead}. ${where}. Can you beat it?`;
}
