import assert from "node:assert/strict";
import test from "node:test";
import {
  PHASE4_SPATIAL_JOIN_CRS,
  spatialJoinOfficialEvents,
  type ChangeGeometryInput,
  type TransformedOfficialEventGeometry,
  type SpatialJoinGeometry,
} from "../lib/phase4/spatial-join";

const square = (west: number, south: number, east: number, north: number): SpatialJoinGeometry => ({
  type: "Polygon",
  crs: PHASE4_SPATIAL_JOIN_CRS,
  linearUnit: "metre",
  coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});

test("the pure adapter computes hectare intersections and stable candidate order", () => {
  const changes = [
    { id: "change-b", province: "BC" as const, observationYear: 2021, geometry: square(0, 0, 100, 100) },
    { id: "change-a", province: "BC" as const, observationYear: 2021, geometry: square(0, 0, 100, 100) },
  ];
  const events = [
    { id: "event-b", province: "BC" as const, eventYear: 2021, geometry: square(50, 0, 150, 100) },
    { id: "event-qc", province: "QC" as const, eventYear: 2021, geometry: square(0, 0, 100, 100) },
    { id: "event-a", province: "BC" as const, eventYear: 2021, geometry: square(25, 0, 75, 100) },
  ];

  const result = spatialJoinOfficialEvents(changes, events);
  assert.deepEqual(result.map(({ change }) => change.id), ["change-a", "change-b"]);
  assert.deepEqual(result[0]?.candidates.map(({ id }) => id), ["event-a", "event-b"]);
  assert.deepEqual(result[0]?.candidates, [
    { id: "event-a", eventYear: 2021, geometryHectares: 0.5, intersectionHectares: 0.5 },
    { id: "event-b", eventYear: 2021, geometryHectares: 1, intersectionHectares: 0.5 },
  ]);
  assert.equal(result[0]?.change.geometryHectares, 1);

  const reversed = spatialJoinOfficialEvents([...changes].reverse(), [...events].reverse());
  assert.deepEqual(reversed, result);
});

test("the adapter supports concave polygons and multipolygons without a spatial dependency", () => {
  const change: SpatialJoinGeometry = {
    type: "Polygon",
    crs: PHASE4_SPATIAL_JOIN_CRS,
    linearUnit: "metre",
    coordinates: [[[0, 0], [100, 0], [100, 100], [50, 50], [0, 100], [0, 0]]],
  };
  const event: SpatialJoinGeometry = {
    type: "MultiPolygon",
    crs: PHASE4_SPATIAL_JOIN_CRS,
    linearUnit: "metre",
    coordinates: [
      [[[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]]],
      [[[50, 50], [100, 50], [100, 100], [50, 100], [50, 50]]],
    ],
  };

  const [set] = spatialJoinOfficialEvents(
    [{ id: "concave-change", province: "QC", observationYear: 2020, geometry: change }],
    [{ id: "multi-event", province: "QC", eventYear: 2020, geometry: event }],
  );
  assert.equal(set?.change.geometryHectares, 0.75);
  assert.equal(set?.candidates[0]?.geometryHectares, 0.5);
  assert.equal(set?.candidates[0]?.intersectionHectares, 0.375);
});

test("existing record geometry metadata can be consumed without dropping its declared area", () => {
  const wrapped = {
    crs: PHASE4_SPATIAL_JOIN_CRS,
    linearUnit: "metre" as const,
    normalized: { type: "Polygon" as const, coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] },
    areaHectares: 1,
  };
  const [set] = spatialJoinOfficialEvents(
    [{ id: "wrapped-change", province: "BC", observationYear: 2020, geometry: wrapped }],
    [{ id: "wrapped-event", province: "BC", eventYear: 2020, geometry: wrapped }],
  );
  assert.equal(set?.change.geometryHectares, 1);
  assert.equal(set?.candidates[0]?.geometryHectares, 1);
  assert.equal(set?.candidates[0]?.intersectionHectares, 1);
});

test("invalid CRS, year, province, geometry, duplicate identity, and area metadata fail closed", () => {
  const validChange: ChangeGeometryInput = { id: "change", province: "BC", observationYear: 2020, geometry: square(0, 0, 100, 100) };
  const validEvent: TransformedOfficialEventGeometry = { id: "event", province: "BC", eventYear: 2020, geometry: square(0, 0, 100, 100) };
  const expectFailure = (change = validChange, event = validEvent, pattern: RegExp) => {
    assert.throws(() => spatialJoinOfficialEvents([change], [event]), pattern);
  };

  expectFailure({ ...validChange, geometry: { ...square(0, 0, 100, 100), crs: "EPSG:4326" as never } }, validEvent, /projected metre CRS/);
  expectFailure(validChange, { ...validEvent, geometry: { ...square(0, 0, 100, 100), crs: "EPSG:32198" } }, /does not match/);
  expectFailure({ ...validChange, geometry: { ...square(0, 0, 100, 100), linearUnit: "degree" as never } }, validEvent, /linear unit/);
  expectFailure(validChange, { ...validEvent, province: "AB" as never }, /BC or QC/);
  expectFailure({ ...validChange, observationYear: 1983 }, validEvent, /integer year/);
  expectFailure(validChange, { ...validEvent, eventYear: 2027 }, /integer year/);
  expectFailure(validChange, { ...validEvent, geometry: { type: "Polygon", crs: PHASE4_SPATIAL_JOIN_CRS, linearUnit: "metre", coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100]]] } as unknown as SpatialJoinGeometry }, /closed/);
  assert.throws(() => spatialJoinOfficialEvents([validChange, { ...validChange, id: validChange.id }], [validEvent]), /duplicate/);
  assert.throws(() => spatialJoinOfficialEvents([validChange], [validEvent, { ...validEvent, id: validEvent.id }]), /duplicate/);
  expectFailure({ ...validChange, geometryHectares: 2 }, validEvent, /does not agree/);
  expectFailure({ ...validChange, geometry: { type: "Polygon", crs: PHASE4_SPATIAL_JOIN_CRS, linearUnit: "metre", coordinates: [[ [0, 0], [100, 0], [100, 100], [0, 100], [0, 0] ], [[10, 10], [20, 10], [20, 20], [10, 10]]] } as unknown as SpatialJoinGeometry }, validEvent, /interior rings/);
  expectFailure({
    ...validChange,
    geometry: {
      type: "MultiPolygon",
      crs: PHASE4_SPATIAL_JOIN_CRS,
      linearUnit: "metre",
      coordinates: [
        [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]],
        [[[50, 50], [150, 50], [150, 150], [50, 150], [50, 50]]],
      ],
    },
  }, validEvent, /overlapping multipolygon/);
});
