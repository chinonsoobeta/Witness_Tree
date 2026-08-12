import type { LicenceId } from "@/lib/domain";

export type ArchiveSnapshot = Readonly<{ status: "example"; sourceLedgerId: string; ingestId: string; requestedUrl: string; retrievedAt: string; httpStatus: number; contentType: string; byteLength: number; sha256: string; objectKey: string; sourceVersion: string; effectiveVersion: string; licence: LicenceId; previousSnapshotKey?: string }>;
export type ArchiveManifest = Readonly<{ status: "example"; snapshots: readonly ArchiveSnapshot[] }>;
