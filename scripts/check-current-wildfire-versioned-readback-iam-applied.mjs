#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const SHA = /^[a-f0-9]{64}$/;
const evidence = read("data/current-wildfire-versioned-readback-iam-applied-2026-08-25.json");
const preparation = read("data/current-wildfire-immutable-promotion-preparation.json");

assert.equal(evidence.schemaVersion, "witness-tree/current-wildfire-versioned-readback-iam-applied/1");
assert.equal(evidence.status, "applied-readback-attested");
assert.equal(evidence.roleName, "WitnessTreeCurrentWildfirePromotionUploader");
assert.equal(evidence.inlinePolicyName, "WitnessTreeCurrentWildfireExactObjectAccess");
assert.deepEqual(evidence.change, { kind: "additive-exact-version-read", addedAction: "s3:GetObjectVersion", resourceCount: 8, resourceSet: "the eight raw payload and manifest keys pinned by current-wildfire-immutable-promotion-preparation.json", wildcards: false });
assert.equal(preparation.proposedRoleScope.objectKeys.length, 8);
assert.equal(new Set(preparation.proposedRoleScope.objectKeys).size, 8);
assert.ok(preparation.proposedRoleScope.objectKeys.every((key) => !key.includes("*")));
assert.ok(preparation.proposedRoleScope.allow.includes("s3:GetObjectVersion"));
assert.equal(evidence.checksums.appliedAgainstPreparationFileSha256, "1d5d759e887c44756d311d9eb71ace09268063abfce3c6593a11d936d05544f1");
assert.equal(evidence.checksums.currentObjectKeySetSha256, hash(JSON.stringify(preparation.proposedRoleScope.objectKeys)));
assert.equal(evidence.checksums.basePolicySha256, "9bd7f2d866b9bcfaad5f8c6c099e4b88755ecd4849eba1f0b7568f3ef1cf6fec");
assert.equal(evidence.checksums.desiredPolicySha256, "f40d08ca17c6b360b116d66b819f653994f26d60e6417c1e7e14b60d9c517e7d");
assert.equal(evidence.checksums.readbackPolicySha256, evidence.checksums.desiredPolicySha256);
assert.ok(Object.values(evidence.checksums).every((value) => SHA.test(value)));
assert.deepEqual(evidence.validation, { accessAnalyzerBlockingFindings: 0, exactVersionRead: "allowed", outOfScopeVersionRead: "implicitDeny" });
assert.match(evidence.operatorDiagnostic, /403 Forbidden.*recovery correctly refused.*no replacement write/i);
assert.match(evidence.redaction, /No credentials.*object version IDs.*object bodies/i);
console.log("current-wildfire versioned-readback IAM applied evidence is internally consistent");
