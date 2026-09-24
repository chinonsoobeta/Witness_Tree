import { ExploreView } from "witness-tree";
import { exploreFixtures } from "witness-tree/lib/explore";
import { ridingIntervalMeasurements } from "witness-tree/lib/explore/riding-intervals";

/*
 * The whole Explore page body: the year control, the map, the layer and overlay
 * switches, and the data view beneath them. It is the largest composition in the
 * system, so the cells vary the two props that change what a reader actually
 * sees rather than trying to cover every combination.
 *
 * `presentation` decides whether the map is drawn at all. In the List cell the
 * component does not silently drop the map; it says the map is hidden and how to
 * bring it back, which is the honest-degradation habit this system keeps
 * everywhere.
 *
 * `data` swaps the chart for the table under the same figures. Both draw on the
 * same provisional province aggregate, and the long note above them exists to
 * stop the map's per-cell span and the aggregate's period from reading as one
 * measurement.
 *
 * The props come from the route's own fixtures and interval helpers, so the
 * numbers here are the numbers the deployed page shows for this span.
 */
const INTERVAL = { fromYear: 2021, toYear: 2022 } as const;
const MEASUREMENTS = ridingIntervalMeasurements(INTERVAL);

const shared = {
  events: exploreFixtures,
  year: INTERVAL.toYear,
  fromYear: INTERVAL.fromYear,
  ridingMeasurements: MEASUREMENTS,
} as const;

export const MapPresentation = () => (
  <ExploreView {...shared} locale="en" mode="forest-change" presentation="map" data="chart" />
);

export const ListPresentation = () => (
  <ExploreView {...shared} locale="en" mode="forest-change" presentation="list" data="chart" />
);

export const TableView = () => (
  <ExploreView {...shared} locale="en" mode="forest-change" presentation="list" data="table" />
);

export const French = () => (
  <ExploreView {...shared} locale="fr" mode="forest-change" presentation="list" data="chart" />
);
