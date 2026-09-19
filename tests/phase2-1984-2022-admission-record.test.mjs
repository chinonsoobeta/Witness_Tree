import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const bytes = (path) => readFileSync(path.startsWith("/") ? path : new URL(path, root));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const record = JSON.parse(bytes("data/phase2-1984-2022-admission-record-2026-09-18.json"));

test("the 1984-2022 admission binds the exact packet the owner approved", () => {
  const packet = bytes(record.ownerDecision.packet.path);
  assert.equal(sha256(packet), "52faeca923f5697a65c6e18b206072412c739ca9ee2a03856a1b263fb32d7083");
  assert.equal(record.ownerDecision.packet.sha256, sha256(packet));
  assert.equal(JSON.parse(packet).status, "template-not-approved", "the packet itself is never edited into an approval");
  assert.deepEqual(record.ownerDecision.items, ["A", "B", "C", "D", "E", "F"]);
  assert.equal(record.ownerDecision.decision, "approve-admission-and-release");
});

test("the record claims admission and release approval, never a release, review or gate", () => {
  assert.equal(record.claims.admitted, true);
  assert.equal(record.claims.releaseApproved, true);
  assert.equal(record.claims.released, false);
  assert.equal(record.claims.expertReviewed, false);
  assert.equal(record.claims.complete, false);
  assert.equal(record.claims.formalGatesChanged, false);
  assert.match(record.ownerDecision.itemDBoundaryConfirmations["qc-provincial-ridings-2026-published"], /not written permission/);
  assert.match(record.ownerDecision.itemEHandling.meaning[1], /not admitted by this record/);
});

test("every repository binding still matches the bytes on disk", () => {
  for (const entry of record.bindingsRevalidated.entries) {
    assert.equal(entry.matches, true, entry.path);
    if (entry.path.startsWith("/") && !existsSync(entry.path)) continue; // data-root evidence is checked where the SSD is attached
    assert.equal(sha256(bytes(entry.path)), entry.sha256, `${entry.path} changed after admission`);
  }
});

test("the records this admission succeeds are untouched", () => {
  assert.equal(sha256(bytes("data/phase2-admission-record-2026-08-26.json")), "58147c088d12190f8882d0c493364cd07cf7c176d4fafbc266421bf337ca7d82");
  assert.equal(sha256(bytes("data/phase2-owner-admission-packet.json")), "f4bc01b389a2c514ad5e04c746821c249ca6c2bf91b6d6f2a46428d6d66d77fd");
});
