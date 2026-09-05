import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Structural and editorial gate over data/restore-drill-2026-08-13.json.
 *
 * The drill it records did contact S3: each payload was downloaded back out of the bucket by its
 * recorded version id and its digests were recomputed from the restored bytes. This script cannot
 * repeat any of that. There is no network access and no S3 credential here. What it checks is the
 * structure of the record and its internal consistency: that every recorded digest is stated in the
 * encoding this repository uses, that every claimed match follows from the two digests it compares,
 * that every duration is a real measured number rather than a placeholder, that absent evidence is an
 * explicit null with a stated reason rather than a zero, and that every key, version id, and digest
 * agrees with data/immutable-promotions.json, which is the record the drill claims to have restored.
 *
 * A record that passes this gate is a well-formed claim. It is not a re-verified one.
 */

const SHA256 = /^[a-f0-9]{64}$/;
const CRC64NVME = /^[a-f0-9]{16}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const OFFSET_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ALIAS = /(?:^|[._/:-])(?:current|latest)(?:$|[._/:-])/i;
const WHOLE_OBJECT_DIGEST_FIELD = /(?:^digest|sha256|crc64nvme)$/i;
const PROVIDER_ENCODED_FIELD = /base64|composite/i;
const EM_DASH = "—";

/**
 * Credential detectors, written as shapes rather than sample values, so this file carries no
 * real-looking account id, ARN, key id, secret, or session token of its own. A restore drill is run
 * with a live credential in the shell, so the risk of one landing in the evidence is real.
 */
const CREDENTIAL_PATTERNS = [
  { name: "an AWS ARN", pattern: /\barn:[a-z0-9*-]*:[a-z0-9*-]*:/i, opaqueRun: false },
  { name: "an AWS account id", pattern: /(?<![0-9a-fA-F])\d{12}(?![0-9a-fA-F])/, opaqueRun: false },
  { name: "an AWS access key id", pattern: /\b[A-Z]{4}[A-Z0-9]{16}\b/, opaqueRun: false },
  { name: "a credential-bearing variable name", pattern: /\b(?:aws[_-]?)?(?:secret[_-]?access[_-]?key|session[_-]?token|access[_-]?key[_-]?id)\b/i, opaqueRun: false },
  { name: "an AWS secret access key", pattern: /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/=])/, opaqueRun: true },
  { name: "a session token", pattern: /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/=_-]{120,}/, opaqueRun: true },
];

/** Every localised block this record must carry. Deleting one language by deleting the block fails here. */
const REQUIRED_LOCALIZED = [
  "notice",
  "method",
  "doesNotProve.summary",
  "scope",
];

/** The three digests every restore recomputes, and the shape each must take. */
const DIGESTS = [
  { field: "sha256", shape: SHA256, label: "a lower-case SHA-256" },
  { field: "crc64nvme", shape: CRC64NVME, label: "a lower-case CRC64NVME" },
];

function resolve(root, dotted) {
  return dotted.split(".").reduce((node, key) => (node === null || node === undefined ? node : node[key]), root);
}

function walk(node, at, visit) {
  visit(node, at);
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, `${at}[${index}]`, visit));
  } else if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) walk(child, at ? `${at}.${key}` : key, visit);
  }
}

function fieldName(at) {
  return at.split(".").pop().replace(/\[\d+\]$/, "");
}

/**
 * @param record the restore-drill evidence record
 * @param promotions data/immutable-promotions.json, the record the drill claims to have restored
 */
export function validateRestoreDrill(record, promotions) {
  const failures = [];
  const fail = (at, message) => failures.push(`${at}: ${message}`);
  const must = (at, condition, message) => {
    if (!condition) fail(at, message);
    return condition;
  };
  const text = (at, value, message = "must be a non-empty string") => must(at, typeof value === "string" && value.trim().length > 0, message);
  const count = (at, value) => must(at, Number.isSafeInteger(value) && value > 0, "must be a positive safe integer");

  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Restore drill record must be a JSON object.");
  if (!promotions || typeof promotions !== "object" || !Array.isArray(promotions.entries)) {
    throw new Error("Restore drill gate needs the immutable promotion record it is checked against.");
  }

  /* Keys and version ids are validated below; the length-based credential detectors skip them,
     because a provider-issued opaque identifier is legitimately a long unbroken run of the same
     alphabet a secret uses. */
  const validatedOpaque = new Set();

  // 1. Bilingual completeness of every localised block.
  walk(record, "", (node, at) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (!("en" in node) && !("fr" in node)) return;
    const where = at || "(root)";
    if (!text(`${where}.en`, node.en) || !text(`${where}.fr`, node.fr)) return;
    must(where, node.en.trim() !== node.fr.trim(), "English and French carry the same text, so one language is a copy of the other");
  });
  for (const dotted of REQUIRED_LOCALIZED) {
    const block = resolve(record, dotted);
    must(dotted, block && typeof block === "object" && typeof block.en === "string" && typeof block.fr === "string", "must be a LocalizedString carrying both en and fr");
  }

  // 2. The em dash is reserved as the Unknown marker and is never punctuation here.
  walk(record, "", (node, at) => {
    if (typeof node === "string" && node.includes(EM_DASH) && node !== EM_DASH) fail(at || "(root)", "uses an em dash as punctuation, which is reserved as the Unknown marker");
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const key of Object.keys(node)) if (key.includes(EM_DASH)) fail(at ? `${at}.${key}` : key, "uses an em dash in a property name");
  });

  // 3. Absent evidence is an explicit null with a stated reason, never a zero and never an omission.
  walk(record, "", (node, at) => {
    if (typeof node === "string" && at && !node.trim()) fail(at, "is an empty string; absent evidence must be an explicit null with a stated reason");
  });

  // 4. Digest encoding. Whole-object digests are lower-case hex; base64 lives only in marked fields.
  must("checksumEncoding.recordedEncoding", record.checksumEncoding?.recordedEncoding === "lower-case-hex", "must declare the single lower-case-hex encoding this gate enforces");
  walk(record, "", (node, at) => {
    if (typeof node !== "string" || !at) return;
    const name = fieldName(at);
    if (WHOLE_OBJECT_DIGEST_FIELD.test(name) && !PROVIDER_ENCODED_FIELD.test(name)) {
      must(at, SHA256.test(node) || CRC64NVME.test(node), "is a whole-object digest, so it must be lower-case hex of the length its algorithm produces, never the provider's base64");
    }
  });

  // 5. The bucket and the record the drill claims to have restored.
  must("bucket.bucketId", record.bucket?.bucketId === promotions.bucket?.bucketId, "must name the same bucket the promotion record names");
  must("bucket.regionId", record.bucket?.regionId === promotions.bucket?.region?.regionId, "must name the same region the promotion record names");
  must("restoredFrom.record", record.restoredFrom?.record === "data/immutable-promotions.json", "must name the promotion record this drill is checked against");
  must("restoredFrom.recordedAt", record.restoredFrom?.recordedAt === promotions.recordedAt, "does not carry the instant the promotion record was written");

  // 6. The restores themselves.
  const restores = record.restores;
  const promoted = new Map(promotions.entries.filter((entry) => typeof entry.sourceId === "string").map((entry) => [entry.sourceId, entry]));
  if (!Array.isArray(restores) || restores.length === 0) {
    fail("restores", "must record at least one restore");
  } else {
    restores.forEach((restore, index) => {
      const at = `restores[${index}]`;
      for (const field of ["sourceId", "payloadKey", "payloadVersionId", "restoreMethod"]) text(`${at}.${field}`, restore?.[field]);
      if (typeof restore?.payloadVersionId === "string") validatedOpaque.add(restore.payloadVersionId);

      // The whole point of the drill is that the version was pinned, so the method must say so.
      must(`${at}.restoreMethod`, /--version-id/.test(restore?.restoreMethod ?? ""), "must name the version-id flag, because pinning the version is what this drill exists to demonstrate");
      must(`${at}.restoreMethod`, !/\bs3 cp\b/.test(restore?.restoreMethod ?? ""), "names a copy command that cannot pin a version id");

      // Every restore names a promotion, and agrees with it on key, version, and digests.
      const source = promoted.get(restore?.sourceId);
      if (!must(`${at}.sourceId`, Boolean(source), "names a source the promotion record does not promote")) return;
      must(`${at}.payloadKey`, restore.payloadKey === source.payloadKey, "is not the payload key the promotion record recorded for this source");
      must(`${at}.payloadVersionId`, restore.payloadVersionId === source.payloadVersionId, "is not the payload version id the promotion record recorded for this source");

      const recorded = restore.recorded;
      if (must(`${at}.recorded`, recorded && typeof recorded === "object", "must restate the digests the promotion record holds")) {
        count(`${at}.recorded.byteLength`, recorded.byteLength);
        must(`${at}.recorded.byteLength`, recorded.byteLength === source.remoteByteLength, "is not the byte length the promotion record recorded for this source");
        must(`${at}.recorded.sha256`, SHA256.test(recorded.sha256 ?? "") && source.snapshotId?.endsWith(recorded.sha256), "is not the staged SHA-256 the promotion record carries in this source's snapshot id");
        must(`${at}.recorded.crc64nvme`, recorded.crc64nvme === source.remoteChecksum?.digest, "is not the CRC64NVME the promotion record recorded for this source");
        text(`${at}.recorded.basis`, recorded.basis);
      }

      const recomputed = restore.recomputed;
      if (must(`${at}.recomputed`, recomputed && typeof recomputed === "object", "must record the digests recomputed from the restored bytes")) {
        count(`${at}.recomputed.byteLength`, recomputed.byteLength);
        for (const { field, shape, label } of DIGESTS) {
          must(`${at}.recomputed.${field}`, shape.test(recomputed[field] ?? ""), `must be ${label} recomputed from the restored bytes`);
        }
        text(`${at}.recomputed.basis`, recomputed.basis);
      }

      // Every claimed match must follow from the two values it compares. A true flag over two
      // different digests is the exact false record this gate exists to catch.
      const matches = restore.matches;
      if (must(`${at}.matches`, matches && typeof matches === "object", "must state, field by field, whether the recomputed values matched the recorded ones")) {
        must(`${at}.matches.byteLength`, matches.byteLength === (recorded?.byteLength === recomputed?.byteLength), "states a byte-length match the recorded and recomputed lengths do not support");
        for (const { field } of DIGESTS) {
          must(`${at}.matches.${field}`, matches[field] === (recorded?.[field] === recomputed?.[field]), `states a ${field} match the recorded and recomputed digests do not support`);
        }
        const all = matches.byteLength === true && DIGESTS.every(({ field }) => matches[field] === true);
        must(`${at}.matches.all`, matches.all === all, "does not follow from the field-by-field matches beside it");
        must(`${at}.restoreVerified`, restore.restoreVerified === all, "does not follow from the recorded matches");
      }

      // Duration is operational evidence. A negative or zero duration is not a measurement.
      const timing = restore.timing;
      if (must(`${at}.timing`, timing && typeof timing === "object", "must record how long the restore took")) {
        must(`${at}.timing.startedAt`, TIMESTAMP.test(timing.startedAt ?? ""), "must be a UTC timestamp");
        must(`${at}.timing.completedAt`, TIMESTAMP.test(timing.completedAt ?? ""), "must be a UTC timestamp");
        must(`${at}.timing.durationSeconds`, Number.isFinite(timing.durationSeconds) && timing.durationSeconds > 0, "must be a positive measured duration, never a negative number and never a zero standing in for an unmeasured restore");
        const elapsed = (new Date(timing.completedAt ?? 0).getTime() - new Date(timing.startedAt ?? 0).getTime()) / 1000;
        must(`${at}.timing.durationSeconds`, elapsed === timing.durationSeconds, "does not equal the interval between the recorded start and completion");
        text(`${at}.timing.basis`, timing.basis);
      }

      // The provider response read back during the restore, kept verbatim.
      const provider = restore.providerResponse;
      if (must(`${at}.providerResponse`, provider && typeof provider === "object", "must keep the provider response to the restore verbatim as evidence")) {
        must(`${at}.providerResponse.versionId`, provider.versionId === restore.payloadVersionId, "does not echo the version id the restore asked for, so the restore was not pinned");
        must(`${at}.providerResponse.contentLength`, provider.contentLength === recorded?.byteLength, "does not agree with the recorded byte length");
        must(`${at}.providerResponse.checksumCrc64nvmeBase64`, typeof provider.checksumCrc64nvmeBase64 === "string" && BASE64.test(provider.checksumCrc64nvmeBase64) && provider.checksumCrc64nvmeBase64 === source.providerReported?.checksumBase64, "is not the provider checksum the promotion record recorded for this source");
        must(`${at}.providerResponse.objectLockMode`, provider.objectLockMode === source.providerReportedRetention?.mode, "is not the retention mode the promotion record recorded for this source");
        must(`${at}.providerResponse.objectLockRetainUntilDate`, OFFSET_TIMESTAMP.test(provider.objectLockRetainUntilDate ?? "") && provider.objectLockRetainUntilDate === source.providerReportedRetention?.retainUntilDate, "is not the retain-until date the promotion record recorded for this source");
      }

      // The local staged original, where one still exists. Absent, it is an explicit null with a reason.
      const local = restore.localOriginal;
      if (!must(`${at}.localOriginal`, "localOriginal" in restore, "must be present as an explicit key, not silently omitted")) return;
      if (local === null) {
        text(`${at}.localOriginalAbsentReason`, restore.localOriginalAbsentReason, "must state why no local staged original was compared when localOriginal is null");
        must(`${at}.roundTripVerified`, restore.roundTripVerified === false, "cannot claim an end-to-end round trip when no local staged original was compared");
      } else if (must(`${at}.localOriginal`, local && typeof local === "object", "must be an object or an explicit null")) {
        text(`${at}.localOriginal.path`, local.path);
        count(`${at}.localOriginal.byteLength`, local.byteLength);
        for (const { field, shape, label } of DIGESTS) {
          must(`${at}.localOriginal.${field}`, shape.test(local[field] ?? ""), `must be ${label} recomputed from the local staged original`);
        }
        const agrees = local.byteLength === recomputed?.byteLength && DIGESTS.every(({ field }) => local[field] === recomputed?.[field]);
        must(`${at}.localOriginal.matchesRestored`, local.matchesRestored === agrees, "states an agreement with the restored bytes that the recorded digests do not support");
        must(`${at}.roundTripVerified`, restore.roundTripVerified === (agrees && restore.restoreVerified === true), "does not follow from the recorded comparison against the local staged original");
      }

      // The restored copies were deleted to reclaim disk. That is a fact about this drill, not a gap.
      must(`${at}.restoredCopyRetained`, restore.restoredCopyRetained === false, "must record that the restored copy was not retained; this drill deliberately keeps no second copy");
      text(`${at}.restoredCopyDeletedReason`, restore.restoredCopyDeletedReason, "must state why the restored copy was deleted after verification");
    });

    must("restores", new Set(restores.map((restore) => restore?.sourceId)).size === restores.length, "restores the same source twice");
    must("restoreCount", record.restoreCount === restores.length, "does not equal the number of restores this record lists");
    const verified = restores.filter((restore) => restore?.restoreVerified === true).length;
    must("verifiedRestoreCount", record.verifiedRestoreCount === verified, "does not equal the number of restores this record records as verified");
    must("coverage.promotedPayloadCount", record.coverage?.promotedPayloadCount === promotions.entries.length, "does not equal the number of payloads the promotion record promotes");
    must("coverage.restoredPayloadCount", record.coverage?.restoredPayloadCount === restores.length, "does not equal the number of restores this record lists");
    must("coverage.allRawFilesCovered", record.coverage?.allRawFilesCovered === false, "must stay false; only the promoted payloads were restored, and staged archives outside the promotion record were not");
    text("coverage.uncoveredDetail", record.coverage?.uncoveredDetail);
  }

  // 7. Key hygiene over every recorded key.
  walk(record, "", (node, at) => {
    if (typeof node !== "string" || !node.startsWith("raw/")) return;
    validatedOpaque.add(node);
    must(at, !ALIAS.test(node), "contains an alias segment such as current or latest, which never names one immutable snapshot");
    must(at, !node.includes("//") && !node.includes("..") && !node.includes("%") && !node.includes("\\"), "is not a clean object key");
    must(at, node.split("/").every((segment) => segment.length > 0), "contains an empty key segment");
  });

  // 8. What this drill does not prove. A drill that states no limits is a marketing claim.
  const limits = record.doesNotProve;
  if (must("doesNotProve", limits && Array.isArray(limits.items), "must state plainly what this drill does not prove")) {
    must("doesNotProve.items", limits.items.length >= 3, "must state more than a token limit or two");
    limits.items.forEach((item, index) => {
      const at = `doesNotProve.items[${index}]`;
      text(`${at}.claim`, item?.claim);
      text(`${at}.detail`, item?.detail);
    });
    const claims = limits.items.map((item) => `${item?.claim ?? ""} ${item?.detail ?? ""}`).join(" ").toLowerCase();
    for (const [name, pattern] of [["credential loss", /credential/], ["account compromise", /account compromise|compromis/], ["a second copy or provider durability", /second copy|recovery copy|durabilit|replicat/]]) {
      must("doesNotProve.items", pattern.test(claims), `must state that this drill does not prove a restore survives ${name}`);
    }
  }

  // 9. Record-level timestamps and the conclusions the record draws.
  for (const field of ["recordedAt"]) must(field, TIMESTAMP.test(record[field] ?? ""), "must be a UTC timestamp");
  must("drilledOn", CALENDAR_DAY.test(record.drilledOn ?? ""), "must be a calendar day");
  must("recordedAt", new Date(record.recordedAt ?? 0).getTime() >= new Date(`${record.drilledOn}T00:00:00Z`).getTime(), "cannot precede the day the drill was run");
  text("drilledBy", record.drilledBy);
  must("ciCanRepeat", record.ciCanRepeat === false, "must keep stating that CI cannot repeat a drill that needs S3 credentials and eleven gigabytes of transfer");
  must("productionEligible", record.productionEligible === false, "must stay false; a restore drill is a storage fact only");
  if (must("openDecisions", Array.isArray(record.openDecisions) && record.openDecisions.length > 0, "must stay a non-empty list")) {
    record.openDecisions.forEach((decision, index) => text(`openDecisions[${index}]`, decision));
  }

  // 10. No credential material anywhere in the record.
  walk(record, "", (node, at) => {
    const where = at || "(root)";
    const subjects = typeof node === "string" ? [node] : [];
    if (node && typeof node === "object" && !Array.isArray(node)) subjects.push(...Object.keys(node));
    for (const subject of subjects) {
      for (const { name, pattern, opaqueRun } of CREDENTIAL_PATTERNS) {
        if (opaqueRun && validatedOpaque.has(subject)) continue;
        if (pattern.test(subject)) fail(where, `matches the shape of ${name} and must never be recorded`);
      }
    }
  });

  if (failures.length) throw new Error(`Restore drill evidence gate failed:\n- ${failures.join("\n- ")}`);
  return record;
}

export async function checkRestoreDrill(
  file = new URL("../data/restore-drill-2026-08-13.json", import.meta.url),
  promotionsFile = new URL("../data/immutable-promotions.json", import.meta.url),
) {
  return validateRestoreDrill(JSON.parse(await readFile(file, "utf8")), JSON.parse(await readFile(promotionsFile, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const record = await checkRestoreDrill(
    path.resolve(here, "../data/restore-drill-2026-08-13.json"),
    path.resolve(here, "../data/immutable-promotions.json"),
  );
  const restores = record.restores.length;
  console.log(
    `Restore drill evidence passed for ${restores} recorded ${restores === 1 ? "restore" : "restores"}. `
      + "Structure, internal consistency, and agreement with data/immutable-promotions.json were checked. "
      + "No object was re-downloaded here and nothing was checked against S3; this gate has no network access and no credential.",
  );
}
