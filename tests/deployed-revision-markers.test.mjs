// Proves the marker set fails closed. Every case feeds the checker one changed
// fact and asserts it refuses, so the gate's strictness is a property CI keeps
// rather than a mutation exercise somebody ran once by hand.
import assert from "node:assert/strict";
import test from "node:test";
import {
  RECORD_PATH,
  evaluateDeployedRevision,
  readSources,
  verifyDeployedRevisionMarkers,
} from "../scripts/check-deployed-revision-markers.mjs";

const sources = readSources();

/** Deep on the record, shallow on the source map: replacing an entry is enough. */
function changed(mutate) {
  const draft = {
    record: structuredClone(sources.record),
    files: { ...sources.files },
    routes: [...sources.routes],
  };
  mutate(draft);
  return draft;
}

function refused(mutate, expected) {
  assert.throws(() => verifyDeployedRevisionMarkers(changed(mutate)), expected);
}

const presentMarker = (record) => record.markers.find((marker) => marker.expect === "present");
const absentMarker = (record) => record.markers.find((marker) => marker.expect === "absent");

test("the committed marker set describes this revision", () => {
  const summary = verifyDeployedRevisionMarkers(sources);
  assert.match(summary, /^data\/deployed-revision-markers\.json: \d+ markers over \d+ routes/);
});

test("a present marker whose source stopped rendering it is refused", () => {
  refused((draft) => {
    const marker = presentMarker(draft.record);
    draft.files[marker.source] = draft.files[marker.source].split(marker.text).join("REMOVED");
  }, /is not rendered by .* any more/);
});

test("a present marker naming a file that is not shipped source is refused", () => {
  refused((draft) => {
    presentMarker(draft.record).source = "components/transparency/NotAFile.tsx";
  }, /is not a shipped source file/);
});

test("a present marker reading a gated surface is refused", () => {
  refused((draft) => {
    const marker = presentMarker(draft.record);
    marker.source = draft.record.gatedSurfacesExcluded[0];
    draft.files[marker.source] += `\nconst probe = ${JSON.stringify(marker.text)};\n`;
  }, /reads a surface listed as gated/);
});

test("an absent marker still rendered somewhere is refused", () => {
  refused((draft) => {
    const marker = absentMarker(draft.record);
    const [first] = Object.keys(draft.files);
    draft.files[first] += `\nconst banner = ${JSON.stringify(marker.text)};\n`;
  }, /is still rendered somewhere/);
});

test("an absent marker that names a source is refused", () => {
  refused((draft) => {
    absentMarker(draft.record).source = "components/explore/ExploreYearControl.tsx";
  }, /must name no source/);
});

test("a marker on a path this revision does not serve is refused", () => {
  refused((draft) => {
    presentMarker(draft.record).path = "/en/no-such-page";
  }, /names a path with no page in app\//);
});

test("a repeated marker is refused", () => {
  refused((draft) => {
    draft.record.markers.push(structuredClone(presentMarker(draft.record)));
  }, /repeats a marker already in the set/);
});

test("dropping every French present marker is refused", () => {
  // The replacement is a real English marker, so the set stays large enough and
  // the only rule left to break is the bilingual one.
  refused((draft) => {
    draft.record.markers = draft.record.markers.filter(
      (marker) => !(marker.expect === "present" && marker.path.startsWith("/fr/")),
    );
    draft.record.markers.push({
      path: "/en/explore",
      expect: "present",
      text: "Earlier last year",
      source: "components/explore/ExploreYearControl.tsx",
      reason: "The other half of the interval control, used here only to keep the marker count above the floor.",
    });
  }, /has no present marker under \/fr\//);
});

test("dropping the only retired marker is refused", () => {
  refused((draft) => {
    draft.record.markers = draft.record.markers.filter((marker) => marker.expect !== "absent");
  }, /needs at least one retired string/);
});

test("a marker set too small to cover both locales in both directions is refused", () => {
  refused((draft) => {
    draft.record.markers = draft.record.markers.slice(0, 3);
  }, /needs at least four markers/);
});

test("flipping any claim to true is refused", () => {
  for (const claim of Object.keys(sources.record.claims)) {
    refused((draft) => {
      draft.record.claims[claim] = true;
    }, /and a marker sweep is not evidence of it/);
  }
});

test("schema, status and origin drift are refused", () => {
  refused((draft) => {
    draft.record.schemaVersion = "witness-tree/deployed-revision-markers/2";
  }, /schemaVersion drifted/);
  refused((draft) => {
    draft.record.status = "deployed-site-browser-observation";
  }, /status drifted/);
  refused((draft) => {
    draft.record.origin = "https://www.witnesstree.ca/en/explore";
  }, /must be a bare https origin/);
});

test("an unexpected field, a missing marker field, and a thin reason are refused", () => {
  refused((draft) => {
    draft.record.deployedCommit = "f7d0ad0";
  }, /carries missing or unexpected fields/);
  refused((draft) => {
    delete presentMarker(draft.record).reason;
  }, /carries missing or unexpected fields/);
  refused((draft) => {
    presentMarker(draft.record).reason = "Because.";
  }, /must say in writing why this string is a revision fact/);
  refused((draft) => {
    presentMarker(draft.record).text = "short";
  }, /text is too short to identify a revision/);
});

test("an excluded gated surface that is not shipped source is refused", () => {
  refused((draft) => {
    draft.record.gatedSurfacesExcluded.push("components/search/Removed.tsx");
  }, /which is not a shipped source file/);
});

test("an origin that answered nothing reads as behind, not as current", () => {
  const { behind, findings } = evaluateDeployedRevision(sources.record.markers, {});
  assert.equal(behind, true);
  assert.ok(findings.every((finding) => finding.outcome === "not-fetched"));
});

test("a page that did not answer 200 reads as behind", () => {
  const pages = Object.fromEntries(sources.record.markers.map((marker) => [marker.path, { status: 503, body: "" }]));
  const { behind, findings } = evaluateDeployedRevision(sources.record.markers, pages);
  assert.equal(behind, true);
  assert.ok(findings.every((finding) => finding.outcome === "http-503"));
});

test("a page carrying every present marker and no retired one reads as current", () => {
  const pages = {};
  for (const marker of sources.record.markers) pages[marker.path] ??= { status: 200, body: "" };
  for (const marker of sources.record.markers) {
    if (marker.expect === "present") pages[marker.path].body += `${marker.text}\n`;
  }
  const { behind, findings } = evaluateDeployedRevision(sources.record.markers, pages);
  assert.equal(behind, false);
  assert.ok(findings.every((finding) => finding.outcome === "as-expected"));
});

test("a page still carrying a retired string reads as behind", () => {
  const pages = {};
  for (const marker of sources.record.markers) pages[marker.path] ??= { status: 200, body: "" };
  for (const marker of sources.record.markers) pages[marker.path].body += `${marker.text}\n`;
  const { behind, findings } = evaluateDeployedRevision(sources.record.markers, pages);
  assert.equal(behind, true);
  assert.equal(findings.filter((finding) => finding.outcome === "still-on-page").length, 1);
});

test("an empty marker set cannot be evaluated at all", () => {
  assert.throws(() => evaluateDeployedRevision([], { "/en/data": { status: 200, body: "" } }), /proves nothing/);
});

test("the record is the only path the checker reads it from", () => {
  assert.equal(RECORD_PATH, "data/deployed-revision-markers.json");
});
