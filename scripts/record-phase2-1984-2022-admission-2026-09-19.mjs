import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OWNER_DECISION, RECORD as PRIOR_RECORD, revalidate } from "./record-phase2-1984-2022-admission.mjs";

// Re-records the owner's 2026-09-18 decision against a corrected evidence
// shape. The decision itself is untouched: the same six items, the same words,
// the same day. What changes is what the packet binds.
//
// The 2026-09-18 packet pinned the two formal-gate status records at their
// living paths. A status record is not immutable. Phase 8 holds
// cdn-tile-validation, which is designed to fail when the Explore client
// changes and to pass again once the Site is redeployed and re-observed, so
// the pin broke on ordinary work and would have broken again on the repair.
// This successor binds dated snapshots of the exact bytes the old pins already
// named, so the historical claim stays verifiable while the living records
// remain free to move.
//
// The 2026-09-18 packet and record are not edited. They stay on disk as
// written, and this record names them as what it succeeds.

const REPO = fileURLToPath(new URL("../", import.meta.url));
const PACKET = "data/phase2-1984-2022-owner-admission-packet-2026-09-19.json";
const PACKET_SHA256 = "545858510866ef30e99d7725cd82864ad673735bf665d1e31ac7e18b7116f2e4";
export const RECORD = "data/phase2-1984-2022-admission-record-2026-09-19.json";

const sha256Of = (relative) => createHash("sha256").update(readFileSync(path.join(REPO, relative))).digest("hex");

export async function buildRecord() {
  const packetBytes = readFileSync(path.join(REPO, PACKET));
  const packetSha = createHash("sha256").update(packetBytes).digest("hex");
  if (packetSha !== PACKET_SHA256) throw new Error(`the packet on disk is ${packetSha}, not the ${PACKET_SHA256} this record was written against`);
  const packet = JSON.parse(packetBytes);
  if (packet.decisionId !== OWNER_DECISION.decisionId) throw new Error("the packet's decisionId does not match the decision");
  if (packet.status !== "template-not-approved") throw new Error("the packet is not the unapproved template");
  const letters = Object.keys(packet.items).map((key) => key[0]);
  if (letters.join("") !== OWNER_DECISION.items.join("")) throw new Error(`the packet's items are ${letters}, not ${OWNER_DECISION.items}`);

  // The correction may only move a binding onto a snapshot of the very bytes
  // the superseded packet already named. A changed digest here would mean the
  // successor is asserting something new, which is not what a correction is.
  const prior = JSON.parse(readFileSync(path.join(REPO, packet.correction.supersedes), "utf8"));
  for (const [index, entry] of packet.formalGateAssessment.statusRecords.entries()) {
    const before = prior.formalGateAssessment.statusRecords[index];
    if (entry.sha256 !== before.sha256) throw new Error(`statusRecords[${index}] digest changed; a correction may move a path, never a checksum`);
    if (entry.byteLength !== before.byteLength) throw new Error(`statusRecords[${index}] byteLength changed; a correction may move a path, never a length`);
  }

  const revalidated = await revalidate(packet);
  const broken = revalidated.filter((entry) => !entry.matches);
  if (broken.length > 0) throw new Error(`bindings no longer match: ${broken.map((entry) => entry.path).join(", ")}`);

  return {
    schemaVersion: "witness-tree/phase2-1984-2022-admission-record/1",
    status: "recorded-admission",
    supersedes: {
      record: PRIOR_RECORD,
      recordSha256: sha256Of(PRIOR_RECORD),
      packet: packet.correction.supersedes,
      packetSha256: packet.correction.supersedesSha256,
      reason: packet.correction.why,
      what: packet.correction.what,
      meaning:
        "This is the same 2026-09-18 decision, re-recorded against bindings that cannot go stale. The superseded record and packet are not edited and remain on disk; this record does not re-decide any item, and the owner approved the correction of the evidence shape, not a new admission.",
    },
    ownerDecision: { ...OWNER_DECISION, packet: { path: PACKET, byteLength: packetBytes.length, sha256: packetSha } },
    admittedItems: Object.fromEntries(Object.entries(packet.items).map(([key, value]) => [key, value.what])),
    bindingsRevalidated: { count: revalidated.length, allMatch: true, entries: revalidated },
    limits: packet.limitsEveryItemCarries,
    permittedClaims: packet.permittedClaimsAfterAdmission,
    prohibitedClaims: packet.prohibitedClaimsEvenAfterAdmission,
    notAdmitted: Object.keys(packet.notApprovable),
    formalGates: packet.formalGateAssessment,
    claims: {
      admitted: true,
      releaseApproved: true,
      released: false,
      releasedMeaning: "Set by each item's own release record when its bytes are actually published and read back; this record does not claim any release happened.",
      expertReviewed: false,
      complete: false,
      formalGatesChanged: false,
    },
    doesNotEdit: [
      PRIOR_RECORD,
      packet.correction.supersedes,
      "data/phase2-admission-record-2026-08-26.json",
      "data/phase2-owner-admission-packet.json",
      "historical readback evidence",
    ],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = await buildRecord();
  writeFileSync(path.join(REPO, RECORD), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  console.log(`Recorded the corrected 1984-2022 admission at ${RECORD}: ${record.bindingsRevalidated.count} bindings revalidated.`);
}
