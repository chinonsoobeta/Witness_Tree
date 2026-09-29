import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const bytes = (path) => readFileSync(path.startsWith("/") ? path : new URL(path, root));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const PRIOR = "data/phase2-1984-2022-admission-record-2026-09-18.json";
const CURRENT = "data/phase2-1984-2022-admission-record-2026-09-19.json";
const record = JSON.parse(bytes(CURRENT));
const prior = JSON.parse(bytes(PRIOR));

test("the 1984-2022 admission binds the exact packet the owner approved", () => {
  const packet = bytes(record.ownerDecision.packet.path);
  assert.equal(sha256(packet), "545858510866ef30e99d7725cd82864ad673735bf665d1e31ac7e18b7116f2e4");
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

test("the correction moved paths onto frozen bytes and asserted nothing new", () => {
  /*
   * The 2026-09-18 packet pinned the two formal-gate status records at their
   * living paths. Those move by design: Phase 8 holds cdn-tile-validation,
   * which fails whenever the Explore client changes and passes again once the
   * Site is redeployed and re-observed. Binding a statement about a moment to
   * a file that legitimately changes afterwards broke on ordinary work, and
   * would have broken again on the repair.
   *
   * The correction freezes the very bytes each pin already named and binds
   * those instead. That is only a correction if the digests are identical: a
   * changed checksum would make this a new assertion wearing a correction's
   * clothes. So this test compares them pin by pin against the superseded
   * packet, and requires every snapshot to be immutable evidence rather than
   * a second copy of a file that can still move.
   */
  const priorPacket = JSON.parse(bytes(record.supersedes.packet));
  const currentPacket = JSON.parse(bytes(record.ownerDecision.packet.path));
  assert.equal(sha256(bytes(record.supersedes.packet)), record.supersedes.packetSha256);

  const before = priorPacket.formalGateAssessment.statusRecords;
  const after = currentPacket.formalGateAssessment.statusRecords;
  assert.equal(after.length, before.length);
  assert.ok(after.length > 0, "no status records are pinned, so this would pass vacuously");

  for (const [index, entry] of after.entries()) {
    assert.equal(entry.sha256, before[index].sha256, `statusRecords[${index}] checksum moved; a correction may move a path, never a digest`);
    assert.equal(entry.byteLength, before[index].byteLength, `statusRecords[${index}] length moved`);
    assert.notEqual(entry.path, before[index].path, `statusRecords[${index}] still binds the living record it was corrected off`);
    assert.match(entry.path, /-as-admitted-2026-09-18\.json$/);
    assert.equal(sha256(bytes(entry.path)), entry.sha256, `${entry.path} is not the bytes it was frozen from`);
    // The snapshot must be a distinct file from the record that keeps moving.
    assert.equal(entry.livingRecord, before[index].path);
    assert.notEqual(entry.path, entry.livingRecord);
  }
});

test("the records this admission succeeds are untouched", () => {
  // Superseding is not editing. The 2026-09-18 record and packet stay exactly
  // as they were written, including the stale pins that caused the correction.
  assert.equal(sha256(bytes(PRIOR)), "4fc4382364576404af0a231eb0e1fef676b52f73627805605bca5e80a4bf60ee");
  assert.equal(sha256(bytes(prior.ownerDecision.packet.path)), "52faeca923f5697a65c6e18b206072412c739ca9ee2a03856a1b263fb32d7083");
  assert.equal(record.supersedes.record, PRIOR);
  assert.equal(record.supersedes.recordSha256, sha256(bytes(PRIOR)));
  assert.ok(record.doesNotEdit.includes(PRIOR));

  assert.equal(sha256(bytes("data/phase2-admission-record-2026-08-26.json")), "58147c088d12190f8882d0c493364cd07cf7c176d4fafbc266421bf337ca7d82");
  assert.equal(sha256(bytes("data/phase2-owner-admission-packet.json")), "f4bc01b389a2c514ad5e04c746821c249ca6c2bf91b6d6f2a46428d6d66d77fd");
});
