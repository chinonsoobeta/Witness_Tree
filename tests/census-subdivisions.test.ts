import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import release from "../data/census-subdivision-overlay-release.json";
import placeIndex from "../data/place-name-index.json";
import {
  censusSubdivisionMeasurement,
  censusSubdivisionProvince,
  parseCensusSubdivisionFile,
} from "../lib/explore/census-subdivisions";
import { BOUNDARY_OVERLAYS } from "../lib/explore/boundaries";
import { validateCensusSubdivisionRelease } from "../scripts/check-census-subdivision-overlay.mjs";

const figuresFile = (overrides: Record<string, unknown> = {}) => ({
  schema: "witness-tree/census-subdivision-interval-measurements/1",
  province: "BC",
  cellHectares: 0.09,
  firstYear: 1984,
  lastYear: 2022,
  places: [{
    boundaryId: "5953023",
    boundaryName: "Prince George",
    unmappedCells: 0,
    annualLossCells: new Array(38).fill(1),
    knownForestCellsByStartYear: new Array(38).fill(100),
    unknownCellsByStartYear: new Array(38).fill(0),
    // One new cell each year the span widens: 38 cells lost at least once
    // across the whole record, against 38 lost in all.
    unionLossCellDeltas: Array.from({ length: 38 }, (_, start) => Array.from({ length: 38 - start }, () => 1)).flat(),
  }],
  ...overrides,
});

test("a subdivision's province comes from its CSDUID", () => {
  assert.equal(censusSubdivisionProvince("CA-5953023"), "BC");
  assert.equal(censusSubdivisionProvince("CA-2466023"), "QC");
  assert.equal(censusSubdivisionProvince("CA-1001105"), null);
  assert.equal(censusSubdivisionProvince("BC-5953023"), null);
});

test("a province file answers any span for its places, keyed as the tiles are", () => {
  const figures = parseCensusSubdivisionFile(figuresFile(), "BC");
  const whole = censusSubdivisionMeasurement(figures, "CA-5953023", { fromYear: 1984, toYear: 2022 });
  assert.ok(whole);
  assert.equal(whole.overlay, "census-subdivisions");
  assert.equal(whole.jurisdiction, "CA");
  assert.equal(whole.coverage, "complete");
  assert.equal(whole.observedLossHectares, 3.42);
  assert.equal(whole.summedLossHectares, 3.42);
  const annual = censusSubdivisionMeasurement(figures, "CA-5953023", { fromYear: 2021, toYear: 2022 });
  assert.equal(annual?.observedLossPercent, 1);
  assert.equal(censusSubdivisionMeasurement(figures, "CA-5953024", { fromYear: 2021, toYear: 2022 }), null);
});

test("a malformed or mislabelled province file is refused", () => {
  assert.throws(() => parseCensusSubdivisionFile(figuresFile(), "QC"), /envelope/);
  assert.throws(() => parseCensusSubdivisionFile(figuresFile({ firstYear: 1985 }), "BC"), /envelope/);
  assert.throws(() => parseCensusSubdivisionFile(figuresFile({ places: [{ boundaryId: "59" }] }), "BC"), /invalid place/);
  const broken = figuresFile();
  broken.places[0].unionLossCellDeltas[0] = 500;
  const figures = parseCensusSubdivisionFile(broken, "BC");
  assert.throws(() => censusSubdivisionMeasurement(figures, "CA-5953023", { fromYear: 1984, toYear: 1985 }), /span invariant/);
});

test("the layer is pinned to the planned release and draws only the published places", () => {
  const overlay = BOUNDARY_OVERLAYS["census-subdivisions"];
  assert.equal(overlay.url, release.tiles.url);
  assert.equal(overlay.sourceLayer, "census_subdivisions");
  assert.equal(release.tiles.featureCount, placeIndex.counts.places);
  // The owner removed every reference to reserves from the site.
  assert.doesNotMatch(`${overlay.note.en} ${overlay.note.fr}`, /reserve|réserve|treaty|traité/i);
});

test("the release check refuses a planned release until it has been read back", () => {
  assert.throws(() => validateCensusSubdivisionRelease(release, null, placeIndex), /planned but not published/);
  const files = [release.tiles, ...release.figures].map(({ fileName, byteLength, sha256 }) => ({ fileName, byteLength, sha256 }));
  const readback = {
    schemaVersion: "witness-tree/census-subdivision-overlay-release-readback/1",
    releaseId: release.releaseId,
    s3ExactReadback: true,
    cloudFrontExactReadback: true,
    files,
  };
  assert.equal(validateCensusSubdivisionRelease(release, readback, placeIndex).files, 5);
  assert.throws(
    () => validateCensusSubdivisionRelease(release, { ...readback, files: files.slice(1) }, placeIndex),
    /different set of files/,
  );
  const moreTiles = { ...release, tiles: { ...release.tiles, featureCount: release.tiles.featureCount + 676 } };
  assert.throws(() => validateCensusSubdivisionRelease(moreTiles, readback, placeIndex), /place index lists/);
});

test("the browser loader pins the release by name and holds no figures or records", () => {
  const source = readFileSync(new URL("../lib/explore/census-subdivisions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "@\/data\//);
  assert.throws(
    () => validateCensusSubdivisionRelease(release, null, placeIndex, source.replaceAll(release.releaseId, "0".repeat(64))),
    /does not pin/,
  );
  assert.throws(() => validateCensusSubdivisionRelease(release, null, placeIndex, source), /planned but not published/);
});
