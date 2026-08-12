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

export type RemoteArchiveEvidence = Readonly<{
  bucketId: string;
  region: CanadianRegionEvidence;
  payloadVersionId?: string;
  manifestVersionId?: string;
  remoteByteLength?: number;
  remoteSha256?: string;
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
