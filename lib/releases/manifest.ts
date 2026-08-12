export type BilingualReleaseNote = Readonly<{ en: string; fr: string }>;

export type ReleaseArtifact = Readonly<{
  id: string;
  sha256: string;
  licenceId: string;
  localPath?: string;
}>;

export type ReleaseManifest = Readonly<{
  releaseId: string;
  releaseDate: string;
  latestDataEndYear: number;
  boundaryEdition: string;
  methodVersion: string;
  artifacts: readonly ReleaseArtifact[];
  note: BilingualReleaseNote;
  correctionsUrl: string;
  degraded: boolean;
  stale: boolean;
}>;

const SHA_256 = /^[a-f0-9]{64}$/i;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]*$/;
const UNKNOWN_ZERO = /\bunknown\b\s*[:=]?\s*0(?:\.0+)?\b/i;

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Release manifest requires ${field}.`);
  return value;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function validateReleaseManifest(candidate: Partial<ReleaseManifest>, currentYear = new Date().getUTCFullYear()): ReleaseManifest {
  const releaseId = requiredString(candidate.releaseId, "releaseId");
  if (!RELEASE_ID.test(releaseId)) throw new Error("Release manifest releaseId is invalid.");
  const releaseDate = requiredString(candidate.releaseDate, "releaseDate");
  if (!validDate(releaseDate)) throw new Error("Release manifest releaseDate must be YYYY-MM-DD.");
  const latestDataEndYear = candidate.latestDataEndYear;
  if (typeof latestDataEndYear !== "number" || !Number.isInteger(latestDataEndYear) || latestDataEndYear > currentYear) {
    throw new Error("Release manifest latestDataEndYear cannot be beyond the current year.");
  }
  const boundaryEdition = requiredString(candidate.boundaryEdition, "boundaryEdition");
  const methodVersion = requiredString(candidate.methodVersion, "methodVersion");
  const correctionsUrl = requiredString(candidate.correctionsUrl, "correctionsUrl");
  if (!/^https:\/\//.test(correctionsUrl)) throw new Error("Release manifest correctionsUrl must use HTTPS.");
  if (typeof candidate.degraded !== "boolean" || typeof candidate.stale !== "boolean") {
    throw new Error("Release manifest requires degraded and stale flags.");
  }
  if (!candidate.note || typeof candidate.note !== "object") throw new Error("Release manifest requires a bilingual note.");
  const note = { en: requiredString(candidate.note.en, "note.en"), fr: requiredString(candidate.note.fr, "note.fr") };
  if (UNKNOWN_ZERO.test(note.en) || UNKNOWN_ZERO.test(note.fr)) throw new Error("Release manifest must not publish an Unknown numeric zero.");
  if (!Array.isArray(candidate.artifacts) || candidate.artifacts.length === 0) throw new Error("Release manifest requires artifacts.");
  const artifactIds = new Set<string>();
  const artifacts = candidate.artifacts.map((artifact) => {
    const id = requiredString(artifact?.id, "artifact id");
    if (artifactIds.has(id)) throw new Error(`Release manifest artifact id is duplicated: ${id}.`);
    artifactIds.add(id);
    const sha256 = requiredString(artifact?.sha256, `${id} SHA-256`);
    if (!SHA_256.test(sha256)) throw new Error(`Release manifest artifact ${id} requires a SHA-256 checksum.`);
    const licenceId = requiredString(artifact?.licenceId, `${id} licenceId`);
    const localPath = artifact?.localPath;
    if (localPath !== undefined && (typeof localPath !== "string" || !localPath.trim())) throw new Error(`Release manifest artifact ${id} localPath is invalid.`);
    return Object.freeze({ id, sha256: sha256.toLowerCase(), licenceId, ...(localPath ? { localPath } : {}) });
  });
  if (UNKNOWN_ZERO.test(JSON.stringify(candidate))) throw new Error("Release manifest payload must not publish an Unknown numeric zero.");
  return Object.freeze({ releaseId, releaseDate, latestDataEndYear, boundaryEdition, methodVersion, artifacts, note: Object.freeze(note), correctionsUrl, degraded: candidate.degraded, stale: candidate.stale });
}

export type ArtifactComparison = Readonly<{ id: string; change: "added" | "changed" | "removed" }>;

export function compareArtifacts(previous: ReleaseManifest, next: ReleaseManifest): readonly ArtifactComparison[] {
  const before = new Map(previous.artifacts.map((artifact) => [artifact.id, artifact]));
  const after = new Map(next.artifacts.map((artifact) => [artifact.id, artifact]));
  const changes: ArtifactComparison[] = [];
  for (const artifact of next.artifacts) {
    const old = before.get(artifact.id);
    if (!old) changes.push({ id: artifact.id, change: "added" });
    else if (old.sha256 !== artifact.sha256 || old.licenceId !== artifact.licenceId) changes.push({ id: artifact.id, change: "changed" });
  }
  for (const artifact of previous.artifacts) if (!after.has(artifact.id)) changes.push({ id: artifact.id, change: "removed" });
  return changes;
}
