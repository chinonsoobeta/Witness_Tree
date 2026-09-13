import { ExploreMapClient } from "witness-tree";
import { ridingIntervalMeasurements } from "witness-tree/lib/explore/riding-intervals";

/*
 * The map itself, separated from the page around it. A preview has no tile
 * network, so what these cells show is the frame the map lives in: the status
 * line, the legend, the zoom and fullscreen controls, the attribution, and the
 * retry affordance. That frame is what a design composes against, and it is the
 * part that must hold its shape whether or not the basemap ever draws.
 *
 * `mode` changes the legend and the layer being described, not the frame, and
 * that is what the cells vary. There is deliberately no overlays cell: the
 * reference boundaries are drawn onto the basemap and carry no legend or chrome
 * of their own, so with no tiles a cell with every overlay on renders pixel for
 * pixel the same as one with none. Showing it would claim a variation that is
 * not there. The overlay props are documented on the component instead.
 */
const INTERVAL = { fromYear: 2021, toYear: 2022 } as const;
const MEASUREMENTS = ridingIntervalMeasurements(INTERVAL);

const shared = {
  year: INTERVAL.toYear,
  fromYear: INTERVAL.fromYear,
  ridingMeasurements: MEASUREMENTS,
} as const;

export const ForestChange = () => (
  <ExploreMapClient {...shared} locale="en" mode="forest-change" />
);

export const Wildfire = () => <ExploreMapClient {...shared} locale="en" mode="wildfire" />;

export const French = () => <ExploreMapClient {...shared} locale="fr" mode="forest-change" />;
