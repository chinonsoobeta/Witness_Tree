import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Records the owner's 2026-09-18 decision on the 1984-2022 admission packet.
//
// The decision is bound to the packet by its SHA-256, and every byte binding
// the packet names is re-read from disk and must still match before anything
// is written. The packet, the 2026-08-26 record and all historical readback
// evidence are left untouched; this record is their dated successor for the
// 1984-2022 items only.

const REPO = fileURLToPath(new URL("../", import.meta.url));
const PACKET = "data/phase2-1984-2022-owner-admission-packet.json";
const PACKET_SHA256 = "52faeca923f5697a65c6e18b206072412c739ca9ee2a03856a1b263fb32d7083";
export const RECORD = "data/phase2-1984-2022-admission-record-2026-09-18.json";

export const OWNER_DECISION = {
  decisionId: "phase2-1984-2022-series-spans-and-map-admission-v1",
  decidedOn: "2026-09-18",
  decision: "approve-admission-and-release",
  items: ["A", "B", "C", "D", "E", "F"],
  ownerWords: [
    "For the admission packets, I approve items A,B, C, D, E and F.",
    "Item 1: admit and release for A-F.",
  ],
  recordedFrom: "the owner's messages in the Claude Code session of 2026-09-18, given after the packet, its owner-readable summary and the sources record were delivered to the owner",
  acknowledgementsStated:
    "The owner stated no acknowledgement line beyond the words above. The packet's limits, prohibited claims and not-approvable items bind this admission regardless.",
  itemDBoundaryConfirmations: {
    "federal-ridings-2023": "already admitted and release-approved (data/phase1-federal-electoral-production-admission.json)",
    "bc-provincial-ridings-2023": "confirmed by the owner's approval of item D",
    "ab-provincial-ridings-2019-goa": "confirmed by the owner's approval of item D; rights basis is the Open Government Licence - Alberta 2.2, per the sources record",
    "on-provincial-ridings-2022": "confirmed by the owner's approval of item D",
    "qc-provincial-ridings-2026-published":
      "confirmed by the owner's approval of item D; rights basis is the owner's determination recorded in the sources record, which is not written permission from Élections Québec",
  },
  itemEHandling: {
    decidedOn: "2026-09-18",
    ownerWords: "Go, and the admission packet is a go as well. Do it all.",
    meaning: [
      "Release the admitted national archives with a map layer that hides every patch outside BC, AB, ON and QC. This is a display change; the archives are not altered.",
      "Rebuild the archives clipped to the four provinces as a new product. The clipped archives are new bytes and are not admitted by this record; they need their own packet and record.",
    ],
  },
};

const sha256File = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });

function bindings(node, at = "") {
  if (Array.isArray(node)) return node.flatMap((value, index) => bindings(value, `${at}[${index}]`));
  if (node === null || typeof node !== "object") return [];
  const own = typeof node.path === "string" && typeof node.sha256 === "string" ? [{ at, ...node }] : [];
  return [...own, ...Object.entries(node).flatMap(([key, value]) => bindings(value, `${at}.${key}`))];
}

export async function revalidate(packet) {
  const results = [];
  for (const binding of bindings(packet)) {
    const file = path.isAbsolute(binding.path) ? binding.path : path.join(REPO, binding.path);
    const sha256 = await sha256File(file);
    const byteLength = statSync(file).size;
    const ok = sha256 === binding.sha256 && (binding.byteLength === undefined || binding.byteLength === byteLength);
    results.push({ at: binding.at, path: binding.path, byteLength, sha256, matches: ok });
  }
  return results;
}

export async function buildRecord() {
  const packetBytes = readFileSync(path.join(REPO, PACKET));
  const packetSha = createHash("sha256").update(packetBytes).digest("hex");
  if (packetSha !== PACKET_SHA256) throw new Error(`the packet on disk is ${packetSha}, not the ${PACKET_SHA256} the owner approved`);
  const packet = JSON.parse(packetBytes);
  if (packet.decisionId !== OWNER_DECISION.decisionId) throw new Error("the packet's decisionId does not match the decision");
  if (packet.status !== "template-not-approved") throw new Error("the packet is not the unapproved template");
  const letters = Object.keys(packet.items).map((key) => key[0]);
  if (letters.join("") !== OWNER_DECISION.items.join("")) throw new Error(`the packet's items are ${letters}, not ${OWNER_DECISION.items}`);

  const revalidated = await revalidate(packet);
  const broken = revalidated.filter((entry) => !entry.matches);
  if (broken.length > 0) throw new Error(`bindings no longer match: ${broken.map((entry) => entry.path).join(", ")}`);

  return {
    schemaVersion: "witness-tree/phase2-1984-2022-admission-record/1",
    status: "recorded-admission",
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
    doesNotEdit: [PACKET, "data/phase2-admission-record-2026-08-26.json", "data/phase2-owner-admission-packet.json", "historical readback evidence"],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = await buildRecord();
  writeFileSync(path.join(REPO, RECORD), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  console.log(`Recorded the 1984-2022 admission at ${RECORD}: ${record.bindingsRevalidated.count} bindings revalidated.`);
}
