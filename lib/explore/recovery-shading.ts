import { EXPLORE_MAP_COLOURS } from "./map-style";
import { mix } from "./province-cause-shares";

/*
 * The colour scale for condition and recovery: the share of the land that lost
 * tree cover and was treed again for five years in a row after its latest
 * loss. Client-safe; the figures themselves come from the page.
 */

/** Band edges, in percent of the lost area. */
export const RECOVERY_BREAKS = [15, 30, 45, 60] as const;

export function recoveryBand(percent: number | null): 0 | 1 | 2 | 3 | 4 | null {
  if (percent === null || !Number.isFinite(percent) || percent < 0) return null;
  const index = RECOVERY_BREAKS.findIndex((edge) => percent < edge);
  return (index === -1 ? 4 : index) as 0 | 1 | 2 | 3 | 4;
}

/** Five bands, from nearly ground to the full recovery colour. */
export const RECOVERY_RAMP: readonly string[] = [0.14, 0.32, 0.52, 0.74, 1].map((weight) =>
  mix(EXPLORE_MAP_COLOURS.ground, EXPLORE_MAP_COLOURS.recovery, weight));

/**
 * Grey, not the lightest band: no forest was mapped, or the share is withheld
 * under the floor, so no share was measured. The region maps use it too.
 */
export const NO_FOREST_COLOUR = "#c3c5bd";

/** What the map needs of one economic region; a null share is withheld under the floor, never zero. */
export type RecoveryRegionShade = Readonly<{
  id: string;
  name: Readonly<{ en: string; fr: string }>;
  lostHectares: number;
  latestRecoveredPercent: number | null;
  anyRecoveredPercent: number | null;
}>;
