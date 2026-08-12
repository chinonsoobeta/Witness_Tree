import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS = /^https:\/\//;
const FORBIDDEN_LINEAGE_FIELD = /(?:retriev|checksum)/i;
const ACCESS_STATES = new Set(["verified", "catalogue-listed", "unresolved"]);
const LICENCE_STATES = new Set(["verified", "unresolved"]);

function rejectLineageFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_LINEAGE_FIELD.test(key)) throw new Error("Candidates must not claim retrieval or checksum lineage.");
    rejectLineageFields(nested);
  }
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

function officialUrl(value, field) {
  requiredString(value, field);
  if (!HTTPS.test(value) || new URL(value).hostname === "example.local") throw new Error(`${field} must be a non-example HTTPS URL.`);
}

function bilingual(value, field) {
  if (!value || typeof value !== "object" || typeof value.en !== "string" || !value.en.trim() || typeof value.fr !== "string" || !value.fr.trim()) throw new Error(`${field} requires English and French text.`);
}

function date(value, field) {
  requiredString(value, field);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${field} must be an ISO date.`);
}

export function validateSourceCandidates(candidate) {
  if (!candidate || candidate.status !== "candidate") throw new Error("Registry status must be candidate, never production.");
  date(candidate.verificationDate, "Verification date");
  requiredString(candidate.nonClaimNotice, "Nonclaim notice");
  if (!Array.isArray(candidate.entries) || candidate.entries.length === 0) throw new Error("Candidate registry requires entries.");
  const ids = new Set();
  for (const entry of candidate.entries) {
    if (!entry || entry.status !== "candidate" || entry.productionEligible !== false) throw new Error("Candidate entries must never be production eligible.");
    requiredString(entry.id, "Entry id");
    if (ids.has(entry.id)) throw new Error("Candidate entry ids must be unique.");
    ids.add(entry.id);
    rejectLineageFields(entry);
    requiredString(entry.datasetTitle, "Dataset title"); requiredString(entry.publisher, "Publisher"); officialUrl(entry.catalogueUrl, "Catalogue URL"); bilingual(entry.intendedRole, "Intended role");
    if (!new Set(["verified", "partial", "unresolved"]).has(entry.metadataVerification)) throw new Error("Metadata verification state is required.");
    if (!entry.licence || !LICENCE_STATES.has(entry.licence.state)) throw new Error("Licence state is required.");
    if (entry.licence.state === "verified") { requiredString(entry.licence.id, "Licence id"); officialUrl(entry.licence.officialUrl, "Official licence URL"); }
    if (!entry.access || !ACCESS_STATES.has(entry.access.state)) throw new Error("Access state is required.");
    if (entry.access.state === "verified") { if (!Array.isArray(entry.access.formats) || entry.access.formats.length === 0 || entry.access.formats.some((format) => typeof format !== "string" || !format.trim())) throw new Error("Verified access requires formats."); officialUrl(entry.access.url, "Access URL"); }
    if (!Array.isArray(entry.verifiedFacts) || entry.verifiedFacts.length === 0 || entry.verifiedFacts.some((fact) => typeof fact !== "string" || !fact.trim())) throw new Error("Verified facts are required.");
    if (!Array.isArray(entry.unresolvedFields) || entry.unresolvedFields.length === 0 || entry.unresolvedFields.some((field) => typeof field !== "string" || !field.trim())) throw new Error("Unresolved fields must be retained.");
  }
  return candidate;
}

export async function checkSourceCandidates(file = new URL("../data/source-candidates.json", import.meta.url)) {
  const registry = JSON.parse(await readFile(file, "utf8"));
  return validateSourceCandidates(registry);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const registry = await checkSourceCandidates(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/source-candidates.json"));
  console.log(`Source candidates passed for ${registry.entries.length} pre-ingestion records.`);
}
