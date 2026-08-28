import type { LicenceId, Locale, Reported } from "../domain";
export type DownloadLicenceId = LicenceId | "statcan-open-licence";
export type DownloadArtifact = Readonly<{ id: string; kind: "csv-table" | "event-record-geopackage-metadata"; sha256: string; licenceId: DownloadLicenceId; additionalLicenceIds?: readonly DownloadLicenceId[]; attributions?: readonly string[]; contentType: string; boundaryEdition: string; timeRange: string; methodVersion: string; retrievedDate: string; url: string; note: Record<Locale, string> }>;
export type DownloadRelease = Readonly<{ id: string; artifacts: readonly DownloadArtifact[]; readme: Record<Locale, string> }>;
export type DownloadRow = Readonly<{ id: string; reported: Reported }>;
