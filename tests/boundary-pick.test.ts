import assert from "node:assert/strict";
import test from "node:test";
import {
  boundaryHighlightFilter,
  pickBoundary,
  type BoundaryFeature,
} from "../lib/explore/boundary-pick";
import type { BoundarySelection } from "../lib/explore/boundary-readout";

const feature = (
  layer: string,
  properties: Record<string, unknown> | null = {
    id: "f-1",
    name_en: "Example federal",
    name_fr: "Exemple federal",
    juris: "AA",
  },
): BoundaryFeature => ({ layer: { id: layer }, properties });

const overlays = ["federal-ridings", "provincial-ridings"] as const;

test("a fill hit alone is picked", () => {
  assert.deepEqual(pickBoundary([feature("boundary-federal-ridings-fill")], overlays, "en"), {
    overlay: "federal-ridings",
    boundaryId: "f-1",
    name: "Example federal",
    jurisdiction: "AA",
  });
});

test("a line hit beats a fill hit regardless of input order", () => {
  const fill = feature("boundary-federal-ridings-fill", { id: "fill", name_en: "Fill", name_fr: "Remplissage", juris: "AA" });
  const line = feature("boundary-federal-ridings-line", { id: "line", name_en: "Line", name_fr: "Ligne", juris: "AA" });
  assert.equal(pickBoundary([fill, line], overlays, "en")?.boundaryId, "line");
  assert.equal(pickBoundary([line, fill], overlays, "en")?.boundaryId, "line");
});

test("same-kind hits use boundary overlay order, then input order", () => {
  const provincial = feature("boundary-provincial-ridings-fill", { id: "prov", name_en: "Provincial", name_fr: "Provincial", juris: "AA" });
  const federal = feature("boundary-federal-ridings-fill", { id: "fed", name_en: "Federal", name_fr: "Federal", juris: "AA" });
  assert.equal(pickBoundary([provincial, federal], overlays, "en")?.boundaryId, "fed");
  const first = feature("boundary-federal-ridings-fill", { id: "first", name_en: "First", name_fr: "Premier", juris: "AA" });
  const second = feature("boundary-federal-ridings-fill", { id: "second", name_en: "Second", name_fr: "Deuxieme", juris: "AA" });
  assert.equal(pickBoundary([first, second], overlays, "en")?.boundaryId, "first");
});

test("unavailable overlays and unrelated layers, including highlights, are ignored", () => {
  const unavailable = feature("boundary-economic-regions-fill");
  const unrelated = feature("province-fill");
  const selected = feature("boundary-federal-ridings-selected");
  assert.equal(pickBoundary([unavailable, unrelated, selected], overlays, "en"), null);
});

test("missing, non-string, and empty properties are skipped", () => {
  const unusable = [
    feature("boundary-federal-ridings-fill", null),
    feature("boundary-federal-ridings-fill", { id: 1, name_en: "Number", juris: "AA" }),
    feature("boundary-federal-ridings-fill", { id: "", name_en: "Empty id", juris: "AA" }),
    feature("boundary-federal-ridings-fill", { id: "missing-name", name_en: "", juris: "AA" }),
    feature("boundary-federal-ridings-fill", { id: "missing-juris", name_en: "Name", juris: "" }),
  ];
  const usable = feature("boundary-federal-ridings-fill", { id: "usable", name_en: "Usable", name_fr: "Utilisable", juris: "AA" });
  assert.equal(pickBoundary([...unusable, usable], overlays, "en")?.boundaryId, "usable");
});

test("French uses name_fr and a missing usable feature returns null", () => {
  assert.equal(
    pickBoundary([feature("boundary-federal-ridings-fill")], overlays, "fr")?.name,
    "Exemple federal",
  );
  assert.equal(pickBoundary([feature("boundary-federal-ridings-fill", { id: "x", name_en: "Only English", juris: "AA" })], overlays, "fr"), null);
});

test("the highlight filter matches both boundary id and jurisdiction", () => {
  const selection: BoundarySelection = {
    overlay: "federal-ridings",
    boundaryId: "f-9",
    name: "Example nine",
    jurisdiction: "BB",
  };
  assert.deepEqual(boundaryHighlightFilter(selection), [
    "all",
    ["==", ["get", "id"], "f-9"],
    ["==", ["get", "juris"], "BB"],
  ]);
  assert.deepEqual(boundaryHighlightFilter(null), [
    "all",
    ["==", ["get", "id"], ""],
    ["==", ["get", "juris"], ""],
  ]);
});
