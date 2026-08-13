import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Structural and editorial gate over data/immutable-promotions.json.
 *
 * tests/archive-staging-promotions.test.ts already runs the real promotion gate from
 * lib/archive-staging/validate.ts over these records, and derives their keys and snapshot ids from
 * data/staged-acquisitions.json. This script deliberately does not repeat that. It checks the things
 * a schema and an editor would catch and the promotion gate never looks at: bilingual completeness,
 * reserved punctuation, credential material, absent evidence recorded as Unknown rather than zero,
 * digest encoding, the counts the record states about itself, and key hygiene across every recorded
 * key, including the ones the promotion gate never sees.
 *
 * There is no network access and no S3 credential here. Nothing below is verified against the
 * provider. Every assertion is read from the file itself.
 */

const SHA256 = /^[a-f0-9]{64}$/;
const CRC64NVME = /^[a-f0-9]{16}$/;
const HEX_DIGEST = { sha256: SHA256, crc64nvme: CRC64NVME };
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const COMPOSITE_DIGEST = /^[A-Za-z0-9+/]+={0,2}-(\d+)$/;
const MULTIPART_ETAG = /^"[a-f0-9]{32}-(\d+)"$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const OFFSET_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SEGMENT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const ALIAS = /(?:^|[._/:-])(?:current|latest)(?:$|[._/:-])/i;
const WHOLE_OBJECT_DIGEST_FIELD = /(?:^digest|sha256|crc64nvme)$/i;
const PROVIDER_ENCODED_FIELD = /base64|composite/i;
const EM_DASH = "—";

/**
 * Credential detectors. Each is written as a shape, never as a sample value, so this file carries no
 * real-looking account id, ARN, key id, secret, or session token of its own.
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
  "checksumEncoding",
  "reviewBasis",
  "manifestSidecars",
  "writeOnceDemonstration",
  "writeOnceDemonstration.scope",
  "versionIdVerification",
  "versionIdVerification.gap",
  "versionIdVerification.ciProtection",
  "supersededUploads",
  "promotionContract.immutableObjectStorageScope",
];

/**
 * Absent evidence that must be recorded as an explicit null, with the reason stated in a field this
 * gate can name. A 0, an empty string, or a missing key would each read as a measurement instead.
 */
const ABSENT_EVIDENCE = [
  { field: "bucket.objectLockDefaultRetention", reasonField: "promotionContract.conditions.activeComplianceRetention.detail", reason: /no default retention rule/i },
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

export function validateImmutablePromotions(record) {
  const failures = [];
  const fail = (at, message) => failures.push(`${at}: ${message}`);
  const must = (at, condition, message) => {
    if (!condition) fail(at, message);
    return condition;
  };
  const text = (at, value, message = "must be a non-empty string") => must(at, typeof value === "string" && value.trim().length > 0, message);
  const count = (at, value) => must(at, Number.isSafeInteger(value) && value > 0, "must be a positive safe integer");

  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Immutable promotion record must be a JSON object.");

  /* Keys are validated below; the length-based credential detectors skip them, because an object key
     is legitimately a long unbroken run of the same alphabet a secret uses. */
  const validatedKeys = new Set();

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

  // 3. No credential material anywhere in the record.
  const scanCredentials = () => {
    walk(record, "", (node, at) => {
      const where = at || "(root)";
      const subjects = typeof node === "string" ? [node] : [];
      if (node && typeof node === "object" && !Array.isArray(node)) subjects.push(...Object.keys(node));
      for (const subject of subjects) {
        for (const { name, pattern, opaqueRun } of CREDENTIAL_PATTERNS) {
          if (opaqueRun && validatedKeys.has(subject)) continue;
          if (pattern.test(subject)) fail(where, `matches the shape of ${name} and must never be recorded`);
        }
      }
    });
  };

  // 4. Every absent-evidence field is an explicit null with a stated reason.
  for (const { field, reasonField, reason } of ABSENT_EVIDENCE) {
    const parentPath = field.split(".").slice(0, -1).join(".");
    const parent = parentPath ? resolve(record, parentPath) : record;
    const key = fieldName(field);
    if (!must(field, parent && typeof parent === "object" && key in parent, "must be present as an explicit key, not silently omitted")) continue;
    must(field, parent[key] === null, "must be explicit null when the evidence is absent, never 0 and never an empty string");
    const stated = resolve(record, reasonField);
    must(field, typeof stated === "string" && reason.test(stated), `records absent evidence without a stated reason in ${reasonField}`);
  }
  walk(record, "", (node, at) => {
    if (typeof node === "string" && at && !node.trim()) fail(at, "is an empty string; absent evidence must be an explicit null with a stated reason");
  });

  // 5. Digest encoding. Whole-object digests are lower-case hex; base64 lives only in marked fields.
  must("checksumEncoding.recordedEncoding", record.checksumEncoding?.recordedEncoding === "lower-case-hex", "must declare the single lower-case-hex encoding this gate enforces");
  walk(record, "", (node, at) => {
    if (typeof node !== "string" || !at) return;
    const name = fieldName(at);
    if (WHOLE_OBJECT_DIGEST_FIELD.test(name) && !PROVIDER_ENCODED_FIELD.test(name)) {
      must(at, SHA256.test(node) || CRC64NVME.test(node), "is a whole-object digest, so it must be lower-case hex of the length its algorithm produces, never the provider's base64");
    }
    if (node.includes("=") && node.length >= 8 && (BASE64.test(node) || COMPOSITE_DIGEST.test(node))) {
      must(at, PROVIDER_ENCODED_FIELD.test(name), "holds a provider base64 value in a field whose name does not mark it as provider-reported or composite");
    }
  });

  // 6. The promotion entries, their keys, and the counts they state about themselves.
  const entries = record.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    fail("entries", "must list at least one promotion");
    scanCredentials();
    if (failures.length) throw new Error(`Immutable promotion evidence gate failed:\n- ${failures.join("\n- ")}`);
    return record;
  }

  const canonical = new Map();
  entries.forEach((entry, index) => {
    const at = `entries[${index}]`;
    for (const field of ["sourceId", "stagedEntryId", "snapshotId", "payloadKey", "manifestKey", "payloadVersionId", "manifestVersionId", "promotionState", "supersededPayloadKey", "manifestRetention", "retentionMode", "retentionUntil", "uploadMethod", "serverSideEncryption"]) {
      text(`${at}.${field}`, entry?.[field]);
    }
    if (typeof entry?.snapshotId !== "string") return;

    const parts = entry.snapshotId.split(":");
    if (parts.length < 4) {
      fail(`${at}.snapshotId`, "must be sourceId:sourceVersion:retrievedAt:sha256");
      return;
    }
    const sourceId = parts[0];
    const sourceVersion = parts[1];
    const retrievedAt = parts.slice(2, -1).join(":");
    const sha256 = parts[parts.length - 1];
    must(`${at}.snapshotId`, SEGMENT.test(sourceId) && !ALIAS.test(sourceId), "carries a source id that is not a safe alias-free segment");
    must(`${at}.snapshotId`, SEGMENT.test(sourceVersion) && !ALIAS.test(sourceVersion), "carries a source version that is not a safe alias-free segment; an alias such as current or latest is never a snapshot");
    must(`${at}.snapshotId`, TIMESTAMP.test(retrievedAt), "carries a retrieval time that is not a UTC timestamp");
    must(`${at}.snapshotId`, SHA256.test(sha256), "carries a digest that is not a lower-case SHA-256");
    must(`${at}.sourceId`, entry.sourceId === sourceId, "does not match the source id inside snapshotId");

    // The contract derives keys from these four values. Deriving them again here catches a record
    // whose key and snapshot id have drifted apart, which the promotion gate cannot see.
    const prefix = `raw/${sourceId}/${sourceVersion}/${retrievedAt.replace(/:/g, "-")}/${sha256}`;
    must(`${at}.manifestKey`, entry.manifestKey === `${prefix}/manifest.json`, `must be the canonical snapshot key ${prefix}/manifest.json`);
    if (typeof entry.payloadKey === "string") {
      const filename = entry.payloadKey.startsWith(`${prefix}/payload/`) ? entry.payloadKey.slice(`${prefix}/payload/`.length) : null;
      if (filename === null) fail(`${at}.payloadKey`, `must be the canonical snapshot key ${prefix}/payload/{filename}`);
      else must(`${at}.payloadKey`, SEGMENT.test(filename) && filename === filename.toLowerCase(), "carries a payload basename that is not a safe lower-case segment");
    }
    canonical.set(sourceId, entry);

    must(`${at}.payloadVersionId`, entry.payloadVersionId !== entry.manifestVersionId, "reuses the sidecar version id");
    count(`${at}.expectedByteLength`, entry.expectedByteLength);
    count(`${at}.remoteByteLength`, entry.remoteByteLength);
    count(`${at}.manifestByteLength`, entry.manifestByteLength);
    must(`${at}.byteLengthMatches`, entry.byteLengthMatches === (entry.expectedByteLength === entry.remoteByteLength), "states a byte-length match the recorded lengths do not support");

    const checksum = entry.remoteChecksum;
    if (must(`${at}.remoteChecksum`, checksum && typeof checksum === "object", "must record the remote checksum")) {
      must(`${at}.remoteChecksum.checksumType`, checksum.checksumType === "full-object", "must be a full-object checksum for a recorded whole-object digest");
      const shape = HEX_DIGEST[checksum.algorithm];
      if (must(`${at}.remoteChecksum.algorithm`, Boolean(shape), "must name an algorithm this contract records")) {
        must(`${at}.remoteChecksum.digest`, shape.test(checksum.digest ?? ""), "must be lower-case hex of the length its algorithm produces");
      }
      must(`${at}.checksumMatches`, entry.checksumMatches === (checksum.digest === entry.stagedCrc64nvme), "states a checksum match the recorded digests do not support");
    }
    const provider = entry.providerReported;
    if (must(`${at}.providerReported`, provider && typeof provider === "object", "must keep the provider value verbatim as evidence")) {
      must(`${at}.providerReported.encoding`, provider.encoding === "base64", "must declare the provider encoding");
      must(`${at}.providerReported.checksumBase64`, typeof provider.checksumBase64 === "string" && BASE64.test(provider.checksumBase64) && !CRC64NVME.test(provider.checksumBase64) && !SHA256.test(provider.checksumBase64), "must hold the provider value in base64, not a hex digest");
    }

    must(`${at}.retentionUntil`, TIMESTAMP.test(entry.retentionUntil ?? ""), "must be a UTC timestamp");
    const providerRetention = entry.providerReportedRetention;
    if (must(`${at}.providerReportedRetention`, providerRetention && typeof providerRetention === "object", "must keep the provider retention read-back verbatim")) {
      must(`${at}.providerReportedRetention.mode`, providerRetention.mode === "COMPLIANCE", "must report compliance mode for a locked payload");
      must(`${at}.providerReportedRetention.retainUntilDate`, OFFSET_TIMESTAMP.test(providerRetention.retainUntilDate ?? ""), "must be a UTC timestamp with an explicit offset");
      must(`${at}.providerReportedRetention.retainUntilDate`, new Date(providerRetention.retainUntilDate ?? "").getTime() === new Date(entry.retentionUntil ?? "").getTime(), "names a different instant from retentionUntil");
    }

    const multipart = entry.multipart;
    if (multipart !== undefined) {
      const partCount = multipart.partCount;
      const partSize = multipart.partSizeBytes;
      if (count(`${at}.multipart.partCount`, partCount) && count(`${at}.multipart.partSizeBytes`, partSize) && Number.isSafeInteger(entry.remoteByteLength)) {
        must(`${at}.multipart.partCount`, partSize * (partCount - 1) < entry.remoteByteLength && partSize * partCount >= entry.remoteByteLength, "does not span the recorded byte length at the recorded part size");
        must(`${at}.multipart.lastPartBytes`, multipart.lastPartBytes === entry.remoteByteLength - partSize * (partCount - 1), "does not equal the remainder the recorded part size and count leave");
      }
      const etag = MULTIPART_ETAG.exec(multipart.etag ?? "");
      if (must(`${at}.multipart.etag`, Boolean(etag), "must be a quoted multipart ETag of lower-case hex and a part-count suffix")) {
        must(`${at}.multipart.etag`, Number(etag[1]) === partCount, "carries a part-count suffix that is not the recorded part count");
      }
      must(`${at}.uploadMethod`, String(entry.uploadMethod).includes(String(partCount)), "does not name the recorded part count");
    }

    must(`${at}.supersededPayloadKey`, entry.supersededPayloadKey !== entry.payloadKey, "must be distinct from the canonical payload key");
  });

  // 7. Key hygiene over every recorded key, canonical or legacy, including keys the gate never sees.
  walk(record, "", (node, at) => {
    if (typeof node !== "string" || !node.startsWith("raw/")) return;
    validatedKeys.add(node);
    must(at, !ALIAS.test(node), "contains an alias segment such as current or latest, which never names one immutable snapshot");
    must(at, !node.includes("//") && !node.includes("..") && !node.includes("%") && !node.includes("\\"), "is not a clean object key");
    must(at, node.split("/").every((segment) => segment.length > 0), "contains an empty key segment");
  });

  const canonicalKeys = new Set(entries.flatMap((entry) => [entry.payloadKey, entry.manifestKey]).filter((key) => typeof key === "string"));
  must("entries", canonicalKeys.size === entries.length * 2, "does not give every promotion a distinct payload key and sidecar key");
  const versionIds = entries.flatMap((entry) => [entry.payloadVersionId, entry.manifestVersionId]).filter((id) => typeof id === "string");
  must("entries", new Set(versionIds).size === versionIds.length, "reuses a provider version id across promotions");

  // 8. The superseded flat-key uploads, cross-linked to the canonical promotions they replaced.
  const superseded = record.supersededUploads;
  if (must("supersededUploads", superseded && Array.isArray(superseded.entries), "must record the earlier upload it supersedes")) {
    must("supersededUploads.entries", superseded.entries.length === entries.length, "must name one earlier upload for each promotion");
    superseded.entries.forEach((old, index) => {
      const at = `supersededUploads.entries[${index}]`;
      for (const field of ["sourceId", "stagedEntryId", "objectKey", "versionId", "promotionState", "supersededByPayloadKey"]) text(`${at}.${field}`, old?.[field]);
      const replacement = canonical.get(old?.sourceId);
      if (!must(at, Boolean(replacement), "names a source with no canonical promotion")) return;
      must(`${at}.objectKey`, old.objectKey === replacement.supersededPayloadKey, "is not the key the replacing promotion names as superseded");
      must(`${at}.supersededByPayloadKey`, old.supersededByPayloadKey === replacement.payloadKey, "does not point at the canonical payload key that replaced it");
      must(`${at}.stagedEntryId`, old.stagedEntryId === replacement.stagedEntryId, "does not name the same staging record as its replacement");
      must(`${at}.objectKey`, old.objectKey !== replacement.payloadKey, "cannot be the canonical key it was replaced by");
      must(`${at}.stagedSha256`, SHA256.test(old.stagedSha256 ?? "") && replacement.snapshotId.endsWith(old.stagedSha256), "does not carry the staged digest its replacement snapshot id records");
      must(`${at}.expectedByteLength`, old.expectedByteLength === replacement.expectedByteLength, "does not carry the same byte length as its replacement");
      must(`${at}.byteLengthMatches`, old.byteLengthMatches === (old.expectedByteLength === old.remoteByteLength), "states a byte-length match the recorded lengths do not support");
      must(`${at}.promotionState`, old.promotionState === "superseded", "must stay recorded as superseded");
      for (const field of ["retentionMode", "retentionUntil"]) {
        if (!must(`${at}.${field}`, field in old, "must be present as an explicit key, not silently omitted")) continue;
        must(`${at}.${field}`, old[field] === null, "must be explicit null when no retention was applied, never 0 and never an empty string");
      }
      must(`${at}.retentionMode`, typeof superseded.en === "string" && /no retention was ever applied/i.test(superseded.en), "records absent retention without a stated reason in supersededUploads.en");
      if (!must(`${at}.remoteSha256`, "remoteSha256" in old, "must be present as an explicit key, not silently omitted")) return;
      if (old.remoteSha256 === null) {
        text(`${at}.checksumNote`, old.checksumNote, "must state why no whole-object SHA-256 exists when remoteSha256 is null");
        must(`${at}.checksumMatches`, old.checksumMatches === false, "cannot claim a checksum match when remoteSha256 is Unknown");
        const composite = COMPOSITE_DIGEST.exec(old.independentIntegrityProof?.locallyRecomputedComposite ?? "");
        if (must(`${at}.independentIntegrityProof`, Boolean(composite), "must recompute the composite digest locally when no whole-object digest exists")) {
          must(`${at}.independentIntegrityProof.partCount`, Number(composite[1]) === old.independentIntegrityProof.partCount, "does not match the part-count suffix of the recomputed composite digest");
          must(`${at}.independentIntegrityProof.matchesRemote`, old.independentIntegrityProof.matchesRemote === (old.independentIntegrityProof.locallyRecomputedComposite === old.remoteChecksumBase64), "states a composite match the recorded digests do not support");
        }
      } else {
        must(`${at}.remoteSha256`, SHA256.test(old.remoteSha256), "must be lower-case hex when it is recorded at all");
        must(`${at}.checksumMatches`, old.checksumMatches === (old.remoteSha256 === old.stagedSha256), "states a checksum match the recorded digests do not support");
      }
    });
  }

  // 9. The write-once demonstration, checked against the entry it names.
  const demo = record.writeOnceDemonstration;
  if (must("writeOnceDemonstration", demo && typeof demo === "object", "must record the demonstrated write-once evidence")) {
    must("writeOnceDemonstration.demonstratedOn", CALENDAR_DAY.test(demo.demonstratedOn ?? ""), "must be a calendar day");
    text("writeOnceDemonstration.demonstratedBy", demo.demonstratedBy);
    text("writeOnceDemonstration.requirement", demo.requirement);
    const attempts = demo.attempts;
    if (must("writeOnceDemonstration.attempts", Array.isArray(attempts) && attempts.length > 0, "must list the attempts that were run")) {
      attempts.forEach((attempt, index) => {
        for (const field of ["attempt", "detail", "outcome", "errorCode", "providerMessage"]) text(`writeOnceDemonstration.attempts[${index}].${field}`, attempt?.[field]);
      });
      must("writeOnceDemonstration.attempts", new Set(attempts.map((attempt) => attempt?.attempt)).size === attempts.length, "repeats an attempt name");
      must("writeOnceDemonstration.status", demo.status !== "satisfied" || attempts.every((attempt) => attempt?.outcome === "refused"), "cannot be satisfied while an attempt was not refused");
    }
    const target = entries.find((entry) => entry.payloadKey === demo.target?.payloadKey);
    if (must("writeOnceDemonstration.target.payloadKey", Boolean(target), "must name a payload key this record actually promotes")) {
      must("writeOnceDemonstration.target.payloadVersionId", demo.target.payloadVersionId === target.payloadVersionId, "does not match the version id recorded for that payload");
      must("writeOnceDemonstration.target.sourceId", demo.target.sourceId === target.sourceId, "does not match the source id recorded for that payload");
      const post = demo.postCheck ?? {};
      must("writeOnceDemonstration.postCheck.deleteMarkersUnderPrefix", Number.isSafeInteger(post.deleteMarkersUnderPrefix) && post.deleteMarkersUnderPrefix >= 0, "must be a counted integer, which is a measurement rather than absent evidence");
      const agrees = post.remoteByteLength === target.remoteByteLength
        && post.providerReportedChecksumBase64 === target.providerReported?.checksumBase64
        && post.checksumAlgorithm === target.providerReported?.checksumAlgorithm
        && post.objectLockMode === target.providerReportedRetention?.mode
        && post.objectLockRetainUntilDate === target.providerReportedRetention?.retainUntilDate
        && post.deleteMarkersUnderPrefix === 0;
      must("writeOnceDemonstration.postCheck.matchesRecordedEntry", post.matchesRecordedEntry === agrees, "states an agreement with the recorded entry that the recorded values do not support");
    }
  }

  // 10. The out-of-band version-id resolution, which this gate cannot and does not repeat.
  const resolution = record.versionIdVerification;
  if (must("versionIdVerification", resolution && typeof resolution === "object", "must record how the version ids were resolved")) {
    must("versionIdVerification.recordedVersionIdCount", Number.isSafeInteger(resolution.recordedVersionIdCount) && resolution.recordedVersionIdCount <= versionIds.length, "claims more recorded version ids than this record lists");
    must("versionIdVerification.resolvedVersionIdCount", Number.isSafeInteger(resolution.resolvedVersionIdCount) && resolution.resolvedVersionIdCount <= resolution.recordedVersionIdCount, "claims more resolved version ids than it records");
    must("versionIdVerification.ciCanRepeat", resolution.ciCanRepeat === false, "must keep stating that CI cannot repeat a check that needs S3 credentials");
    must("versionIdVerification.pointInTime", resolution.pointInTime === true, "must keep stating that the resolution is point-in-time");
    must("versionIdVerification.verifiedOn", CALENDAR_DAY.test(resolution.verifiedOn ?? ""), "must be a calendar day");
    const mutations = resolution.gap?.mutationEvidence;
    if (must("versionIdVerification.gap.mutationEvidence", Array.isArray(mutations) && mutations.length > 0, "must record what the mutation run found")) {
      mutations.forEach((mutation, index) => {
        const at = `versionIdVerification.gap.mutationEvidence[${index}]`;
        text(`${at}.mutation`, mutation?.mutation);
        text(`${at}.reason`, mutation?.reason, "must state a reason, because a count of zero failing tests is a measurement and never a silent gap");
        must(`${at}.testsFailed`, Number.isSafeInteger(mutation?.testsFailed) && mutation.testsFailed >= 0, "must be a counted integer");
        must(`${at}.detected`, mutation?.detected === (mutation?.testsFailed > 0), "states a detection the recorded failing-test count does not support");
      });
    }
  }

  // 11. The contract conditions, and what the record concludes from them.
  const contract = record.promotionContract;
  if (must("promotionContract", contract && contract.conditions && typeof contract.conditions === "object", "must record the contract conditions it claims to satisfy")) {
    const conditions = Object.entries(contract.conditions);
    for (const [name, condition] of conditions) {
      must(`promotionContract.conditions.${name}.satisfied`, typeof condition?.satisfied === "boolean", "must be an explicit boolean");
      text(`promotionContract.conditions.${name}.detail`, condition?.detail);
    }
    const allSatisfied = conditions.every(([, condition]) => condition?.satisfied === true);
    const allVerified = entries.every((entry) => entry.promotionState === "remote-verified");
    must("promotionContract.remoteVerified", contract.remoteVerified === allSatisfied, "does not follow from the recorded conditions");
    must("promotionContract.immutableObjectStorage", contract.immutableObjectStorage === (allSatisfied && allVerified), "does not follow from the recorded conditions and promotion states");
    must("promotionContract.productionEligible", contract.productionEligible === false, "must stay false; remote verification is a storage fact only");
  }

  // 12. Record-level timestamps and the open decisions.
  for (const field of ["recordedAt", "revisedAt", "reviewedAt"]) must(field, TIMESTAMP.test(record[field] ?? ""), "must be a UTC timestamp");
  must("evidenceAddedOn", CALENDAR_DAY.test(record.evidenceAddedOn ?? ""), "must be a calendar day");
  must("revisedAt", new Date(record.revisedAt ?? 0).getTime() >= new Date(record.recordedAt ?? 0).getTime(), "cannot precede recordedAt");
  must("reviewedAt", new Date(record.reviewedAt ?? 0).getTime() >= new Date(record.recordedAt ?? 0).getTime(), "cannot precede recordedAt");
  text("reviewer", record.reviewer);
  text("verificationMethod", record.verificationMethod);
  must("supersededUploads.recordedAt", superseded?.recordedAt === record.recordedAt, "must carry the instant the record was first written");
  if (must("openDecisions", Array.isArray(record.openDecisions) && record.openDecisions.length > 0, "must stay a non-empty list")) {
    record.openDecisions.forEach((decision, index) => text(`openDecisions[${index}]`, decision));
  }

  scanCredentials();
  if (failures.length) throw new Error(`Immutable promotion evidence gate failed:\n- ${failures.join("\n- ")}`);
  return record;
}

export async function checkImmutablePromotions(file = new URL("../data/immutable-promotions.json", import.meta.url)) {
  return validateImmutablePromotions(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkImmutablePromotions(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/immutable-promotions.json"));
  console.log(`Immutable promotion evidence passed for ${record.entries.length} recorded ${record.entries.length === 1 ? "promotion" : "promotions"}. No value here was checked against the provider.`);
}
