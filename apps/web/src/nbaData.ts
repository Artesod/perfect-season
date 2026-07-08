import type { NbaDataset } from '@perfect-season/shared';
import { isValidNbaDataset } from '@perfect-season/sim';
import rawDataset from '../../../data/nba-players.json';

/**
 * The bundled real-NBA dataset (refreshed by the scheduled scrape workflow).
 * Null if the file is ever missing fields or truncated — the UI then falls
 * back to procedurally generated players.
 */
export const NBA_DATASET: NbaDataset | null = isValidNbaDataset(rawDataset) ? rawDataset : null;
