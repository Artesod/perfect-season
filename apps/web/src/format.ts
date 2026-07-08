import type { Player, RunState } from '@perfect-season/shared';

export function money(millions: number): string {
  return `$${millions.toFixed(1)}M`;
}

export function pct(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

export function playerName(players: readonly Player[], playerId: string): string {
  return players.find((p) => p.id === playerId)?.name ?? 'a player';
}

/** Player lookup across roster and league (events can outlive a waived player). */
export function anyPlayerName(run: RunState, playerId: string): string {
  const everyone = [...run.roster, ...(run.draft?.pool ?? []), ...run.league.flatMap((t) => t.players)];
  return playerName(everyone, playerId);
}

/** Replace {player} placeholders with the involved players' names. */
export function fillCardText(text: string, names: readonly string[]): string {
  const joined = names.length > 1 ? names.join(' and ') : (names[0] ?? 'a player');
  return text.replaceAll('{player}', joined);
}
