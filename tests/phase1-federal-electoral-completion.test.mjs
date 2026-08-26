import assert from "node:assert/strict";
import test from "node:test";
import {
  METHOD_VERSION,
  OUTPUT_LAYER,
  OUTPUT_RELATIVE_PATH,
  SPEC_ID,
  completionOutcome,
} from "../scripts/run-phase1-federal-electoral-transformation.mjs";

const OUTPUT = "/data/out.gpkg";
const SIDECAR = "/data/out.gpkg.sidecar.json";
const SHA = "ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05";
const BYTES = 20525056;
const paths = { outputPath: OUTPUT, sidecarPath: SIDECAR };

function sidecar(overrides = {}) {
  return {
    specId: SPEC_ID,
    methodVersion: METHOD_VERSION,
    output: { path: `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}`, layer: OUTPUT_LAYER },
    outputSha256: SHA,
    outputByteLength: BYTES,
    ...overrides,
  };
}

// Both files present, sidecar valid, bytes matching. Everything else varies
// one fact at a time from this baseline.
function io({ doc = sidecar(), sha = SHA, size = BYTES, has = () => true } = {}) {
  return [
    () => (typeof doc === "string" ? doc : JSON.stringify(doc)),
    () => sha,
    () => size,
    has,
  ];
}

test("an absent pair is ready to produce", () => {
  assert.deepEqual(completionOutcome(paths, ...io({ has: () => false })), { action: "produce" });
});

test("a matching pair reports completion with the verified bytes", () => {
  assert.deepEqual(completionOutcome(paths, ...io()), { action: "complete", sha256: SHA, byteLength: BYTES });
});

test("an output without its sidecar requires owner review rather than a silent retry", () => {
  assert.throws(() => completionOutcome(paths, ...io({ has: (target) => target === OUTPUT })), /output exists without its sidecar/);
});

test("a sidecar without its output requires owner review rather than a silent retry", () => {
  assert.throws(() => completionOutcome(paths, ...io({ has: (target) => target === SIDECAR })), /sidecar exists without its output/);
});

test("an unreadable sidecar is never treated as completion", () => {
  assert.throws(() => completionOutcome(paths, ...io({ doc: "{not json" })), /unreadable or invalid JSON/);
});

test("a sidecar that is not an object is refused", () => {
  assert.throws(() => completionOutcome(paths, ...io({ doc: "[]" })), /not a JSON object/);
});

test("a foreign specification cannot claim this output", () => {
  assert.throws(() => completionOutcome(paths, ...io({ doc: sidecar({ specId: "some-other-spec" }) })), /foreign specification/);
});

test("a drifted method version cannot claim this output", () => {
  assert.throws(() => completionOutcome(paths, ...io({ doc: sidecar({ methodVersion: `${METHOD_VERSION}-v2` }) })), /method version differs/);
});

test("a sidecar bound to a different output path is refused", () => {
  assert.throws(() => completionOutcome(paths, ...io({ doc: sidecar({ output: { path: "../Witness_Tree-data/elsewhere.gpkg", layer: OUTPUT_LAYER } }) })), /different output path/);
});

test("a sidecar bound to a different layer is refused", () => {
  assert.throws(() => completionOutcome(paths, ...io({ doc: sidecar({ output: { path: `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}`, layer: "other_layer" } }) })), /different output layer/);
});

test("a missing output record is refused", () => {
  assert.throws(() => completionOutcome(paths, ...io({ doc: sidecar({ output: undefined }) })), /output record is missing/);
});

test("an unusable declared byte length is refused rather than defaulted", () => {
  for (const value of [0, -1, 1.5, "20525056", undefined]) {
    assert.throws(() => completionOutcome(paths, ...io({ doc: sidecar({ outputByteLength: value }) })), /no usable output byte length/);
  }
});

test("an unusable declared checksum is refused rather than defaulted", () => {
  for (const value of [undefined, "", "not-a-sha", SHA.toUpperCase(), `${SHA}00`]) {
    assert.throws(() => completionOutcome(paths, ...io({ doc: sidecar({ outputSha256: value }) })), /no usable output SHA-256/);
  }
});

test("an output whose size drifted from its sidecar is refused", () => {
  assert.throws(() => completionOutcome(paths, ...io({ size: BYTES - 1 })), /byte length drifted/);
});

test("an output whose checksum drifted from its sidecar is refused", () => {
  assert.throws(() => completionOutcome(paths, ...io({ sha: `${"0".repeat(63)}1` })), /checksum drifted/);
});

test("completion is never inferred from the output alone: the checksum is always recomputed", () => {
  let hashed = 0;
  completionOutcome(paths, () => JSON.stringify(sidecar()), () => { hashed += 1; return SHA; }, () => BYTES, () => true);
  assert.equal(hashed, 1);
});
