import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateBoundaryOverlays } from "../scripts/check-boundary-overlays.mjs";
import {
  BOUNDARY_OVERLAYS,
  BOUNDARY_OVERLAY_IDS,
  AVAILABLE_BOUNDARY_OVERLAYS,
  parseBoundaryOverlays,
  toggleBoundaryOverlay,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/boundaries.ts";

const release = JSON.parse(
  await readFile(new URL("../data/boundary-overlay-release.json", import.meta.url), "utf8"),
);
const source = await readFile(
  new URL("../lib/explore/boundaries.ts", import.meta.url),
  "utf8",
);
const readback = JSON.parse(
  await readFile(new URL("../data/boundary-overlay-release-readback.json", import.meta.url), "utf8"),
);
const buildScript = await readFile(
  new URL("../scripts/build-boundary-overlay-tiles.mjs", import.meta.url),
  "utf8",
);
const publishScript = await readFile(
  new URL("../scripts/publish-boundary-overlay-release.mjs", import.meta.url),
  "utf8",
);

const PROVINCE_CLIP = {
  operation: "intersection",
  boundaryRelativePath: "raw/statcan-boundaries/2026-08-12/lpr_000b21a_e.zip",
  boundarySha256: "d28bbb15d7b49e3d1828755a5f1b4ebcee699ad70efe8b0f1b902d29ebffd20b",
  boundaryLayer: "lpr_000b21a_e",
  boundaryFilter: "PRUID IN ('24','35','48','59')",
  provinceIds: ["24", "35", "48", "59"],
  boundaryFeatureCount: 4,
  boundarySourceCrs: "EPSG:3347",
  outputCrs: "EPSG:4326",
  appliesTo: ["economic-regions", "watersheds"],
} as const;

type ClipFixtureRelease = {
  transform?: {
    clip: {
      operation: string;
      boundarySha256: string;
      boundaryFilter: string;
      appliesTo: readonly string[];
    };
  };
};

const makeV3Fixture = () => {
  const releaseId = "a".repeat(64);
  const fixture = structuredClone(release);
  const fixtureProductId = "boundary-overlays-v3";
  fixture.productId = fixtureProductId;
  fixture.releaseId = releaseId;
  fixture.base = release.base
    .replace(release.productId, fixtureProductId)
    .replace(release.releaseId, releaseId);
  fixture.transform = { clip: structuredClone(PROVINCE_CLIP) };
  fixture.sources = fixture.sources.map((entry: {
    overlay: string;
    featureCount: number;
    districtCount: number;
    inputFeatureCount?: number;
    inputDistinctCount?: number;
    sourceFeatureCount?: number;
  }) => {
    const clipped = PROVINCE_CLIP.appliesTo.includes(entry.overlay as (typeof PROVINCE_CLIP.appliesTo)[number]);
    const inputFeatureCount = entry.inputFeatureCount ?? entry.sourceFeatureCount ?? entry.featureCount;
    const inputDistinctCount = entry.inputDistinctCount ?? entry.sourceFeatureCount ?? entry.districtCount;
    const outputFeatureCount = entry.overlay === "economic-regions" ? 44 : entry.featureCount;
    const outputDistinctCount = entry.overlay === "economic-regions" ? 44 : entry.districtCount;
    return {
      ...entry,
      inputFeatureCount,
      inputDistinctCount,
      ...(clipped ? { selectedFeatureCount: outputFeatureCount } : {}),
      featureCount: outputFeatureCount,
      districtCount: outputDistinctCount,
      clippedToProvinceBoundary: clipped,
    };
  });
  fixture.archives = fixture.archives.map((archive: { overlay: string; fileName: string; url: string }) => ({
    ...archive,
    fileName: archive.fileName.replaceAll("-v2.", "-v3."),
    url: `${fixture.base}/${archive.fileName.replaceAll("-v2.", "-v3.")}`,
    clippedToProvinceBoundary: PROVINCE_CLIP.appliesTo.includes(archive.overlay as (typeof PROVINCE_CLIP.appliesTo)[number]),
    ...(archive.overlay === "economic-regions" ? { featureCount: 44 } : {}),
  }));
  const sourceV3 = source
    .replaceAll(release.base, fixture.base)
    .replaceAll(release.releaseId, releaseId)
    .replaceAll(release.productId, fixtureProductId)
    .replaceAll("-v2.pmtiles", "-v3.pmtiles");
  const readbackV3 = {
    schemaVersion: "witness-tree/boundary-overlay-release-readback/1",
    releaseId,
    s3ExactReadback: true,
    cloudFrontExactReadback: true,
    archives: fixture.archives.map(({ fileName, byteLength, sha256 }: { fileName: string; byteLength: number; sha256: string }) => ({
      fileName,
      byteLength,
      sha256,
    })),
  };
  return { release: fixture, source: sourceV3, readback: readbackV3 };
};

test("the published release reconciles with what the app pins", () => {
  const result = validateBoundaryOverlays(release, source, readback);
  assert.equal(result.archives, 4);
  assert.equal(result.provincial, 4);
  assert.equal(release.productId, "boundary-overlays-v3");
  assert.deepEqual(release.transform.clip, PROVINCE_CLIP);
});

test("the build clips in the shared output CRS after reprojection", () => {
  assert.match(buildScript, /four-province-boundaries\.gpkg/);
  assert.match(buildScript, /"-f", "GPKG"/);
  assert.match(buildScript, /"-t_srs", "EPSG:4326"/);
  assert.match(buildScript, /"-clipdst", clipBoundaryPath, "-clipdstlayer", "four-province-boundaries"/);
  assert.doesNotMatch(buildScript, /"-clipsrc"/);
});

test("the publisher records exact S3 and CloudFront readbacks", () => {
  assert.match(publishScript, /aws\(\["s3api", "get-object"/);
  assert.match(publishScript, /await fetch\(url/);
  assert.match(publishScript, /exact CloudFront readback does not match/);
  assert.match(publishScript, /s3ExactReadback: true/);
  assert.match(publishScript, /cloudFrontExactReadback: true/);
  assert.match(publishScript, /boundary-overlay-release-readback\.json/);
});

test("the release checker rejects a remote byte mismatch", () => {
  const fixture = makeV3Fixture();
  const drifted = structuredClone(fixture.readback);
  drifted.archives[0].sha256 = "0".repeat(64);
  assert.throws(() => validateBoundaryOverlays(fixture.release, fixture.source, drifted), /does not match/);
});

test("the checker rejects drift that would draw nothing or claim too much", () => {
  const fixture = makeV3Fixture();
  const validRelease = fixture.release;
  const validSource = fixture.source;
  // A layer rename is the failure this gate exists for: the tiles still load,
  // the style still asks for a layer, and the map simply draws nothing.
  const renamed = structuredClone(validRelease);
  renamed.archives[0].layer = "federal_districts";
  assert.throws(() => validateBoundaryOverlays(renamed, validSource), /source layer/);

  // The coverage note must name every province actually published. The count
  // is kept consistent here so the guard under test is the one that fires.
  const withSask = structuredClone(validRelease);
  withSask.sources.push({
    id: "sk", overlay: "provincial-ridings", jurisdiction: "SK",
    sha256: "0".repeat(64), inputFeatureCount: 61, inputDistinctCount: 61,
    featureCount: 61, districtCount: 61, clippedToProvinceBoundary: false,
  });
  const provincialArchive = withSask.archives.find(
    (archive: { overlay: string }) => archive.overlay === "provincial-ridings",
  );
  provincialArchive.featureCount += 61;
  assert.throws(() => validateBoundaryOverlays(withSask, validSource), /Unknown provincial jurisdiction/);

  // Feature counts must reconcile to the sources they were built from.
  const miscounted = structuredClone(validRelease);
  miscounted.archives[1].featureCount = 430;
  assert.throws(() => validateBoundaryOverlays(miscounted, validSource), /but its sources total/);

  // A release id that is not the one the app pins must not pass.
  const restamped = structuredClone(validRelease);
  restamped.releaseId = "b".repeat(64);
  restamped.base = `https://example.invalid/${restamped.releaseId}/tiles`;
  assert.throws(() => validateBoundaryOverlays(restamped, validSource), /does not pin/);

  // An unavailable overlay that quietly gained a URL would be published
  // without any of the evidence an available one has to carry.
  const smuggled = validSource.replace(
    'available: true,\n      url: url("economic-regions-v3.pmtiles"),',
    'available: false,\n      url: url("economic-regions-v3.pmtiles"),',
  );
  assert.throws(() => validateBoundaryOverlays(validRelease, smuggled), /must not declare a tile URL/);
});

test("the checker rejects a missing or altered province clip contract", () => {
  const mutators: readonly ((candidate: ClipFixtureRelease) => void)[] = [
    (candidate) => { delete candidate.transform; },
    (candidate) => { candidate.transform!.clip.operation = "bounds"; },
    (candidate) => { candidate.transform!.clip.boundarySha256 = "0".repeat(64); },
    (candidate) => { candidate.transform!.clip.boundaryFilter = "PRUID IN ('10')"; },
    (candidate) => { candidate.transform!.clip.appliesTo = ["economic-regions"]; },
  ];
  for (const mutate of mutators) {
    const fixture = makeV3Fixture();
    mutate(fixture.release);
    assert.throws(() => validateBoundaryOverlays(fixture.release, fixture.source), /clip|province/i);
  }

  const fixture = makeV3Fixture();
  fixture.release.archives.find((archive: { overlay: string }) => archive.overlay === "economic-regions").clippedToProvinceBoundary = false;
  assert.throws(() => validateBoundaryOverlays(fixture.release, fixture.source), /incorrect province clip metadata/);

  const miscounted = makeV3Fixture();
  const economic = miscounted.release.sources.find((entry: { overlay: string }) => entry.overlay === "economic-regions");
  economic.selectedFeatureCount = economic.inputFeatureCount + 1;
  assert.throws(() => validateBoundaryOverlays(miscounted.release, miscounted.source), /pre-clip selected/);
});

test("the provincial overlay names its riding counts and representation orders", () => {
  const note = BOUNDARY_OVERLAYS["provincial-ridings"].note;
  assert.equal(note.en, "British Columbia, Alberta, Ontario and Québec · 431 ridings\nRepresentation orders: British Columbia 2023, Alberta 2019, Ontario 2022, Québec 2026.");
  assert.equal(note.fr, "Colombie-Britannique, Alberta, Ontario et Québec · 431 circonscriptions\nDécrets de représentation : Colombie-Britannique 2023, Alberta 2019, Ontario 2022, Québec 2026.");
  assert.doesNotMatch(`${note.en}\n${note.fr}`, /territories|territoires|does not take effect|n'entre en vigueur|Use ridings, not districts|Utilisez le terme circonscriptions/);
});

test("unavailable overlays carry a reason and no tiles", () => {
  for (const id of BOUNDARY_OVERLAY_IDS) {
    const overlay = BOUNDARY_OVERLAYS[id];
    if (overlay.available) {
      assert.ok(overlay.url, `${id} is available but has no tiles`);
      assert.ok(overlay.sourceLayer, `${id} is available but names no source layer`);
      assert.ok(overlay.attribution, `${id} is available but carries no attribution`);
    } else {
      assert.equal(overlay.url, undefined);
      assert.ok(overlay.reason, `${id} is unavailable but gives no reason`);
    }
  }
  assert.deepEqual([...AVAILABLE_BOUNDARY_OVERLAYS], [...BOUNDARY_OVERLAY_IDS]);
});

test("reserves and treaty areas are absent rather than shown as unavailable", () => {
  // They were removed because the sources are authority-blocked, not because
  // they are pending. Listing them as "not available yet" would imply work in
  // progress that is not happening.
  for (const id of ["reserves", "treaty-areas"]) {
    assert.equal(BOUNDARY_OVERLAY_IDS.includes(id as never), false);
  }
});

test("the overlay query parameter is parsed defensively and round-trips", () => {
  assert.deepEqual([...parseBoundaryOverlays("federal-ridings")], ["federal-ridings"]);
  assert.deepEqual(
    [...parseBoundaryOverlays("provincial-ridings,federal-ridings")],
    ["federal-ridings", "provincial-ridings"],
  );
  // Unknown and malformed values degrade to no overlay rather
  // than to an error page.
  for (const bad of [undefined, "", "reserves", "  ", "federal-ridings;drop"]) {
    const parsed = parseBoundaryOverlays(bad as string | undefined);
    assert.equal(parsed.includes("reserves" as never), false);
  }
  assert.deepEqual([...parseBoundaryOverlays(" federal-ridings , watersheds ")], ["federal-ridings", "watersheds"]);
});

test("toggling preserves declaration order so links are stable", () => {
  const both = toggleBoundaryOverlay(["provincial-ridings"], "federal-ridings");
  assert.deepEqual([...both], ["federal-ridings", "provincial-ridings"]);
  assert.deepEqual([...toggleBoundaryOverlay(both, "federal-ridings")], ["provincial-ridings"]);
  assert.deepEqual([...toggleBoundaryOverlay([], "federal-ridings")], ["federal-ridings"]);
});
