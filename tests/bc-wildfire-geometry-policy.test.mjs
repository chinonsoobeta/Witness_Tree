import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validate } from "../scripts/check-bc-wildfire-geometry-policy.mjs";
const record = JSON.parse(readFileSync(new URL("../data/bc-wildfire-geometry-policy-2026-08-14.json", import.meta.url), "utf8"));
test("BC wildfire repairs only the bounded feature and quarantines the excess-area feature", () => { assert.equal(validate(record), record); assert.throws(() => validate({...record, features: [...record.features.slice(0, 1), {...record.features[1], relativeAreaDelta: 0.00001}]})); assert.throws(() => validate({...record, productionEligible: true})); });
