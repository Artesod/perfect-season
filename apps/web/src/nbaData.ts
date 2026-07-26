import type { EraDataset, NbaDataset, PlayerPool, PoolMode } from '@perfect-season/shared';
import { isValidEraDataset, isValidNbaDataset } from '@perfect-season/sim';
import rawDataset from '../../../data/nba-players.json';
import rawEraDataset from '../../../data/nba-players-eras.json';

/**
 * The bundled real-player datasets (current rosters refreshed by the
 * scheduled scrape workflow; era rosters refreshed manually per 2K release).
 * Null if a file is ever missing fields or truncated — the UI then hides the
 * modes that depend on it and falls back to procedurally generated players.
 */
export const NBA_DATASET: NbaDataset | null = isValidNbaDataset(rawDataset) ? rawDataset : null;

export const ERA_DATASET: EraDataset | null = isValidEraDataset(rawEraDataset)
  ? rawEraDataset
  : null;

/** The pool for a selected mode, or null when its data isn't available. */
export function poolForMode(mode: PoolMode | 'procedural'): PlayerPool | null {
  switch (mode) {
    case 'procedural':
      return null;
    case 'current':
      return NBA_DATASET ? { mode, nba: NBA_DATASET } : null;
    case 'classic':
    case 'all-time':
      return ERA_DATASET ? { mode, eras: ERA_DATASET } : null;
    case 'mixed':
      return NBA_DATASET && ERA_DATASET
        ? { mode, nba: NBA_DATASET, eras: ERA_DATASET }
        : null;
  }
}
