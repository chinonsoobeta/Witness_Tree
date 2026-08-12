import type { LicenceId, Locale, Reported } from "../domain";
export type DownloadArtifact = Readonly<{ id: string; kind: "csv-table" | "event-record-geopackage-metadata"; sha256: string; licenceId: LicenceId; contentType: string; boundaryEdition: string; timeRange: string; methodVersion: string; retrievedDate: string; url: string; note: Record<Locale, string> }>;
export type DownloadRelease = Readonly<{ id: string; artifacts: readonly DownloadArtifact[]; readme: Record<Locale, string> }>;
export type DownloadRow = Readonly<{ id: string; reported: Reported }>;
