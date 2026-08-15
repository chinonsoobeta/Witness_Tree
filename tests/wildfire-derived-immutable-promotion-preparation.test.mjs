import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {dryRunLines, validate} from "../scripts/prepare-wildfire-derived-immutable-promotion.mjs";
test("derived wildfire promotion contract is exact, quarantined, and non-admitting", () => { const p=validate(); const lines=dryRunLines(p).join("\n"); assert.match(lines,/216-feature/); assert.match(lines,/188-feature/); assert.match(lines,/ADMISSION-BLOCK bc-wildfire/); assert.match(lines,/ADMISSION-BLOCK on-fire-disturbance/); assert.equal(p.artifacts[0].lineage.quarantined,"V10755"); assert.equal(p.claims.productionEligible,false); });
test("derived runner is dry-run/preflight only until a distinct role and approval exist", () => { const r=readFileSync(new URL("../scripts/run-wildfire-derived-approved-promotion.sh",import.meta.url),"utf8"); assert.match(r,/WitnessTreeWildfireDerivedPromotionUploader/); assert.match(r,/No derived-key IAM role or artifact-specific owner approval exists/); assert.doesNotMatch(r,/aws |DeleteObject|BypassGovernanceRetention|PutObjectLegalHold/); });
