#!/usr/bin/env node
/**
 * Keeps the question "is the deployed Site running this revision?" answerable.
 *
 * Merging to main does not update the Site. The two drift apart in silence, and
 * every symptom of the drift reads as a product defect: a route that answers 404
 * instead of the 503 its code returns, a section missing from a page that
 * renders it unconditionally, a banner the owner retired still on screen. Each
 * of those was diagnosed once by hand, from first principles, which is the
 * expensive way to learn that nothing was wrong with the code.
 *
 * data/deployed-revision-markers.json names short strings this revision renders,
 * and one it has stopped rendering, on public pages. This gate proves the marker
 * set still describes the repository: a present marker must occur in the source
 * it names, and an absent marker must occur nowhere in the shipped source. That
 * is what stops the set from rotting into a list of strings nobody renders any
 * more, which would report a healthy Site as stale or a stale one as healthy.
 *
 * The network half lives in scripts/verify-deployed-revision.mjs, which fetches
 * the pages and applies evaluateDeployedRevision to what the origin actually
 * answered. This half runs in CI and touches no network.
 *
 * It admits, releases, ingests and deploys nothing, and it identifies no commit:
 * a missing marker proves the deployed page lacks that string, not which
 * revision produced it.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RECORD_PATH = "data/deployed-revision-markers.json";
export const SOURCE_ROOTS = Object.freeze(["app", "components", "lib"]);
export const SOURCE_EXTENSIONS = Object.freeze([".ts", ".tsx"]);
export const EXPECTATIONS = Object.freeze(new Set(["present", "absent"]));

const TOP_LEVEL_KEYS = [
  "claims",
  "gatedSurfacesExcluded",
  "gatedSurfacesReason",
  "markers",
  "origin",
  "purpose",
  "schemaVersion",
  "status",
];
const MARKER_KEYS = ["expect", "path", "reason", "source", "text"];

function fail(message) {
  throw new Error(message);
}

function keysExactly(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} carries missing or unexpected fields`);
}

/** Every shipped source file, so a marker cannot name a string nobody renders. */
function collectSourceFiles(root, into) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, into);
    else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) into.set(path.relative(REPO_ROOT, full), readFileSync(full, "utf8"));
  }
  return into;
}

/**
 * Applies a marker set to what an origin answered. A page that was not fetched,
 * or that did not answer 200, counts as behind: an unanswered question is not a
 * pass.
 */
export function evaluateDeployedRevision(markers, pages) {
  assert.ok(Array.isArray(markers) && markers.length > 0, "a marker set with no markers proves nothing and must not be evaluated");
  const findings = markers.map((marker) => {
    const page = pages?.[marker.path];
    if (!page) return { ...marker, ok: false, outcome: "not-fetched" };
    if (page.status !== 200) return { ...marker, ok: false, outcome: `http-${page.status}` };
    const found = String(page.body ?? "").includes(marker.text);
    const ok = marker.expect === "present" ? found : !found;
    const outcome = ok ? "as-expected" : marker.expect === "present" ? "missing-from-page" : "still-on-page";
    return { ...marker, ok, outcome };
  });
  return { behind: findings.some((finding) => !finding.ok), findings };
}

export function readSources() {
  const record = JSON.parse(readFileSync(path.join(REPO_ROOT, RECORD_PATH), "utf8"));
  const files = new Map();
  for (const root of SOURCE_ROOTS) collectSourceFiles(path.join(REPO_ROOT, root), files);
  const routes = new Set(
    [...files.keys()]
      .filter((relative) => path.basename(relative) === "page.tsx")
      .map((relative) => `/${path.dirname(relative).split(path.sep).slice(1).join("/")}`),
  );
  return { record, files: Object.fromEntries(files), routes: [...routes].sort() };
}

export function verifyDeployedRevisionMarkers({ record, files, routes }) {
  keysExactly(record, TOP_LEVEL_KEYS, RECORD_PATH);
  assert.equal(record.schemaVersion, "witness-tree/deployed-revision-markers/1", `${RECORD_PATH} schemaVersion drifted`);
  assert.equal(record.status, "engineering-derived-inventory", `${RECORD_PATH} status drifted`);
  assert.ok(/^https:\/\/[a-z0-9.-]+$/.test(record.origin), `${RECORD_PATH} origin must be a bare https origin, not a path`);

  // The record says what it is not, so nobody has to infer it.
  for (const [claim, value] of Object.entries(record.claims)) {
    assert.equal(value, false, `${RECORD_PATH} claims ${claim}, and a marker sweep is not evidence of it`);
  }
  assert.equal(record.claims.identifiesTheDeployedCommit, false, `${RECORD_PATH} must keep saying it does not identify the deployed commit`);

  const { markers } = record;
  assert.ok(Array.isArray(markers) && markers.length >= 4, `${RECORD_PATH} needs at least four markers to cover both locales in both directions`);

  const seen = new Set();
  const routeSet = new Set(routes);
  const sourceText = Object.values(files).join("\n");
  const gated = new Set(record.gatedSurfacesExcluded);

  for (const marker of markers) {
    const label = `${RECORD_PATH} marker ${marker.expect} ${marker.path}`;
    keysExactly(marker, MARKER_KEYS, label);
    assert.ok(EXPECTATIONS.has(marker.expect), `${label} uses an unknown expectation`);
    assert.ok(typeof marker.text === "string" && marker.text.length >= 8, `${label} text is too short to identify a revision`);
    assert.ok(typeof marker.reason === "string" && marker.reason.length >= 40, `${label} must say in writing why this string is a revision fact`);

    const key = `${marker.path} ${marker.text}`;
    if (seen.has(key)) fail(`${label} repeats a marker already in the set, which inflates the count without widening the sweep`);
    seen.add(key);

    if (!routeSet.has(marker.path)) fail(`${label} names a path with no page in app/, so the sweep would fetch a route this revision does not serve`);

    if (marker.expect === "present") {
      assert.ok(typeof marker.source === "string" && marker.source.length > 0, `${label} must name the file that renders it`);
      if (gated.has(marker.source)) {
        fail(`${label} reads a surface listed as gated. Its absence is the correct fail-closed state, so it cannot tell a stale deployment from an unconfigured one.`);
      }
      const contents = files[marker.source];
      if (contents === undefined) fail(`${label} names ${marker.source}, which is not a shipped source file`);
      if (!contents.includes(marker.text)) fail(`${label} is not rendered by ${marker.source} any more, so its absence from a page would no longer prove staleness`);
    } else {
      assert.equal(marker.source, null, `${label} must name no source, because the point of an absent marker is that nothing renders it`);
      if (sourceText.includes(marker.text)) fail(`${label} is still rendered somewhere in ${SOURCE_ROOTS.join(", ")}, so a page carrying it would be current rather than stale`);
    }
  }

  const present = markers.filter((marker) => marker.expect === "present");
  const absent = markers.filter((marker) => marker.expect === "absent");
  assert.ok(absent.length >= 1, `${RECORD_PATH} needs at least one retired string: a purely additive set cannot see a deployment that kept something this revision removed`);
  for (const prefix of ["/en/", "/fr/"]) {
    assert.ok(present.some((marker) => marker.path.startsWith(prefix)), `${RECORD_PATH} has no present marker under ${prefix}, so a half-built bilingual deployment would pass`);
  }

  for (const surface of record.gatedSurfacesExcluded) {
    if (files[surface] === undefined) fail(`${RECORD_PATH} excludes ${surface}, which is not a shipped source file`);
  }
  assert.ok(record.gatedSurfacesReason.length >= 80, `${RECORD_PATH} must say why the gated surfaces are excluded, at length`);

  // Fail-closure of the evaluator, proven here rather than remembered.
  const probe = evaluateDeployedRevision(markers, {});
  assert.equal(probe.behind, true, "an origin that answered nothing must read as behind, not as current");

  return `${RECORD_PATH}: ${markers.length} markers over ${new Set(markers.map((marker) => marker.path)).size} routes; ${present.length} rendered by this revision, ${absent.length} retired by it.`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(verifyDeployedRevisionMarkers(readSources()));
}
