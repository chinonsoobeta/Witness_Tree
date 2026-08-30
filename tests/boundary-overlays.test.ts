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

test("the published release reconciles with what the app pins", () => {
  const result = validateBoundaryOverlays(release, source, readback);
  assert.equal(result.archives, 4);
  assert.equal(result.provincial, 4);
});

test("the release checker rejects a remote byte mismatch", () => {
  const drifted = structuredClone(readback);
  drifted.archives[0].sha256 = "0".repeat(64);
  assert.throws(() => validateBoundaryOverlays(release, source, drifted), /does not match/);
});

test("the checker rejects drift that would draw nothing or claim too much", () => {
  // A layer rename is the failure this gate exists for: the tiles still load,
  // the style still asks for a layer, and the map simply draws nothing.
  const renamed = structuredClone(release);
  renamed.archives[0].layer = "federal_districts";
  assert.throws(() => validateBoundaryOverlays(renamed, source), /source layer/);

  // The coverage note must name every province actually published. The count
  // is kept consistent here so the guard under test is the one that fires.
  const withSask = structuredClone(release);
  withSask.sources.push({
    id: "sk", overlay: "provincial-ridings", jurisdiction: "SK",
    sha256: "0".repeat(64), featureCount: 61, districtCount: 61,
  });
  const provincialArchive = withSask.archives.find(
    (archive: { overlay: string }) => archive.overlay === "provincial-ridings",
  );
  provincialArchive.featureCount += 61;
  assert.throws(() => validateBoundaryOverlays(withSask, source), /Unknown provincial jurisdiction/);

  // Feature counts must reconcile to the sources they were built from.
  const miscounted = structuredClone(release);
  miscounted.archives[1].featureCount = 430;
  assert.throws(() => validateBoundaryOverlays(miscounted, source), /but its sources total/);

  // A release id that is not the one the app pins must not pass.
  const restamped = structuredClone(release);
  restamped.releaseId = "a".repeat(64);
  restamped.base = `https://example.invalid/${restamped.releaseId}/tiles`;
  assert.throws(() => validateBoundaryOverlays(restamped, source), /does not pin/);

  // An unavailable overlay that quietly gained a URL would be published
  // without any of the evidence an available one has to carry.
  const smuggled = source.replace(
    'available: true,\n      url: url("economic-regions-v2.pmtiles"),',
    'available: false,\n      url: url("economic-regions-v2.pmtiles"),',
  );
  assert.throws(() => validateBoundaryOverlays(release, smuggled), /must not declare a tile URL/);
});

test("the provincial overlay states its own gaps rather than implying a national layer", () => {
  const note = BOUNDARY_OVERLAYS["provincial-ridings"].note;
  for (const locale of ["en", "fr"] as const) {
    // Four provinces, named. A reader must never take a blank province as a
    // claim that it has no ridings.
    for (const name of ["Alberta", "Ontario"]) assert.ok(note[locale].includes(name));
    assert.match(note[locale], /territories|territoires/);
  }
  // Quebec's 2026 list is not in force yet, and the copy has to say so.
  assert.match(note.en, /does not take effect/);
  assert.match(note.fr, /n'entre en vigueur/);
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
