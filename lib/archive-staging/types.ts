/**
 * Provider-neutral evidence for promoting already-verified source bytes.
 * This is a pure contract: it neither uploads nor configures storage.
 */
export type LocalStagingRecord = Readonly<{
  storageState: "local-staging";
  immutableObjectStorage: false;
  production: false;
  sourceId: string;
  sourceVersion: string;
  retrievedAt: string;
  byteLength: number;
  sha256: string;
  /**
   * Lower-case hex CRC64NVME of the whole file, computed locally: 16 hex characters, never a
   * provider's base64 form. Optional: it exists only where a full-object remote comparison is needed.
   */
  crc64nvme?: string;
  originalFilename: string;
  publisher: string;
  catalogueUrl: string;
  requestedUrl: string;
  licenceId: string;
  licenceUrl: string;
  requiredAttribution: string;
  changesNotice: string;
}>;

export type CanadianRegionEvidence = Readonly<{
  countryCode: "CA";
  regionId: string;
  evidenceReference: string;
}>;

export type PromotionState = "uploaded" | "remote-verified" | "rejected";

/**
 * Algorithms this contract can link to a locally staged whole-object digest.
 * A single-PUT object tops out at 5 GB and can carry a full-object SHA-256; anything larger is
 * multipart, where S3 offers a full-object digest only for CRC32, CRC32C and CRC64NVME. CRC64NVME
 * is the one this contract stages locally, so it is the size-independent integrity link.
 */
export type FullObjectChecksumAlgorithm = "sha256" | "crc64nvme";

/**
 * A digest over the whole object, directly comparable to the locally staged digest of the same
 * algorithm. This contract records whole-object digests in exactly one encoding: lower-case hex.
 */
export type FullObjectChecksum = Readonly<{
  checksumType: "full-object";
  algorithm: FullObjectChecksumAlgorithm;
  /**
   * Lower-case hex digest of the entire object: 64 characters for SHA-256, 16 for CRC64NVME.
   * A provider that reports base64 (S3 does) must be normalised with `hexDigestFromProviderBase64`
   * before the value is recorded here. A base64 value left in this field fails the digest shape gate
   * instead of passing it, because base64 of these digests can never match the hex shape.
   */
  digest: string;
}>;

/**
 * A multipart digest: a hash over the concatenated per-part digests, suffixed with the part count.
 * It is never equal to the whole-object digest of the same algorithm, so it is a distinct type and
 * comparing it to a FullObjectChecksum is a type error. It carries meaning only alongside the part
 * size and part count that produced it; either being absent leaves the object's integrity Unknown.
 */
export type CompositeChecksum = Readonly<{
  checksumType: "composite";
  algorithm: "sha256";
  /**
   * Provider-formatted digest: base64 over the concatenated per-part digests, then "-{partCount}".
   * This is the one digest kept in the provider's own encoding, because it is opaque: it is never
   * compared to a hex whole-object digest, only to a local recomputation in the identical format.
   */
  digest: string;
  partSizeBytes?: number;
  partCount?: number;
}>;

export type RemoteChecksumEvidence = FullObjectChecksum | CompositeChecksum;

export type RemoteArchiveEvidence = Readonly<{
  bucketId: string;
  region: CanadianRegionEvidence;
  payloadVersionId?: string;
  manifestVersionId?: string;
  remoteByteLength?: number;
  /** What the provider reports for the stored object. */
  remoteChecksum?: RemoteChecksumEvidence;
  /** A composite recomputed locally from the staged bytes, the only way to link a multipart digest back to staging. */
  locallyRecomputedComposite?: CompositeChecksum;
  retentionMode?: "compliance";
  retentionUntil?: string;
}>;

export type ArchivePromotionManifest = Readonly<{
  status: "staging-promotion";
  snapshotId: string;
  staged: LocalStagingRecord;
  payloadKey: string;
  manifestKey: string;
  predecessorPayloadKey?: string;
  promotion: Readonly<{
    state: PromotionState;
    reviewer?: string;
    reviewedAt?: string;
  }>;
  remote?: RemoteArchiveEvidence;
}>;
