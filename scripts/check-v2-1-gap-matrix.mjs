import { readFile } from "node:fs/promises";
import path from "node:path";

export const STATUSES = ["verified-local", "partial", "blocked-external", "pending", "superseded"];
export const MATURITIES = ["local", "archived", "admitted", "production-eligible", "deployed", "publicly-released"];
const REQUIRED_FIELDS = ["id", "kind", "labels", "status", "maturity", "evidence", "owningPhase", "dependencies", "approvalBoundary", "implementationTask", "test", "finalAcceptanceArtifact"];
const EXPECTED_SECTION_17 = `Forest definition adopted and published
Evidence classes implemented
Confidence rules implemented
Conflicting evidence wording locked
Coverage geometry built
Denominator rules implemented
Source ledger complete
Raw archive immutable
Harvest matching implemented
FTA life cycle rule implemented
Precedence hierarchy implemented
Land tenure class populated
Event subtype populated
Boundary editions retained
Validation suite green
Token layer and both themes
Policy components shipped
Unknown renders as an en dash
Place page template complete
Place pages generated
Location result permalink
No-JavaScript path
Table equivalent everywhere
Native time control
Greyscale legibility
Reduced motion respected
Budgets enforced
Four daily refreshes
Freshness stamps
Snapshots retained
Degraded state works
Stale cut-off works
No prediction language
Saved areas isolated
Deletion works
Correction alerts work
Kill switch works
Caps enforced
Bilingual alerts
Normalisation forced
Context on every row
Insufficient coverage separated
Screenshot rule met
Ranking scope enforced
Neutral headers
Reserve and treaty layers loaded
Right of reply live
Minimum area rule
Engagement register published
No ranking
Name request recorded
Corrections log live
Decision log published
Attribution dispute route
Reproducibility proven
Accessibility audited
Load tested
Rename costs one commit`.split("\n");
const AMENDMENT_IDS = ["amendment-annual-public-artifacts", "amendment-four-province-only", "amendment-national-polygon-materialization", "amendment-restricted-provincial-layers", "amendment-per-action-mfa"];

function fail(message) { throw new Error(`Version 2.1 gap matrix invalid: ${message}`); }
function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }

export function validateGapMatrix(matrix) {
  if (!matrix || matrix.version !== "2.1" || !Array.isArray(matrix.requirements)) fail("version 2.1 and requirements array are required");
  const entries = matrix.requirements;
  const ids = new Set();
  for (const entry of entries) {
    for (const field of REQUIRED_FIELDS) if (!(field in entry)) fail(`${entry?.id ?? "unknown"} lacks ${field}`);
    if (!nonempty(entry.id) || ids.has(entry.id)) fail(`id must be unique and nonempty: ${entry.id}`);
    ids.add(entry.id);
    if (!nonempty(entry.kind) || !STATUSES.includes(entry.status) || !MATURITIES.includes(entry.maturity)) fail(`${entry.id} has invalid kind, status, or maturity`);
    if (!entry.labels || !nonempty(entry.labels.en) || !nonempty(entry.labels.fr)) fail(`${entry.id} requires nonempty bilingual labels`);
    if (!Array.isArray(entry.evidence) || !entry.evidence.length || entry.evidence.some((item) => !nonempty(item))) fail(`${entry.id} requires nonempty evidence array`);
    if (!Number.isInteger(entry.owningPhase) || entry.owningPhase < 0 || entry.owningPhase > 9) fail(`${entry.id} requires phase 0 through 9`);
    if (!Array.isArray(entry.dependencies) || entry.dependencies.some((item) => !nonempty(item))) fail(`${entry.id} has invalid dependencies`);
    for (const field of ["approvalBoundary", "implementationTask", "test", "finalAcceptanceArtifact"]) if (!nonempty(entry[field])) fail(`${entry.id} requires ${field}`);
    if (entry.status === "superseded" && (entry.dependencies.length || entry.approvalBoundary !== "none")) fail(`${entry.id} is superseded and cannot be a blocker or dependency`);
  }
  for (const entry of entries) for (const dependency of entry.dependencies) {
    const target = entries.find((candidate) => candidate.id === dependency);
    if (!target) fail(`${entry.id} depends on missing ${dependency}`);
    if (target.status === "superseded") fail(`${entry.id} depends on superseded ${dependency}`);
  }
  const section17 = entries.filter((entry) => entry.kind === "section-17");
  const names = section17.map((entry) => entry.labels.en).sort();
  if (section17.length !== 58 || JSON.stringify(names) !== JSON.stringify([...EXPECTED_SECTION_17].sort())) fail("must cover exactly the 58 non-superseded Section 17 checklist names");
  const phaseIds = entries.filter((entry) => entry.kind === "phase-group").map((entry) => entry.id).sort();
  const expectedPhases = Array.from({ length: 10 }, (_, phase) => `phase-${phase}`);
  if (JSON.stringify(phaseIds) !== JSON.stringify(expectedPhases)) fail("must cover phase groups 0 through 9 exactly once");
  const amendments = entries.filter((entry) => entry.kind === "amendment-override");
  if (JSON.stringify(amendments.map((entry) => entry.id).sort()) !== JSON.stringify([...AMENDMENT_IDS].sort())) fail("must cover every Version 2.1 amendment override");
  if (amendments.some((entry) => entry.status !== "superseded")) fail("amendment overrides must be marked superseded");
  return { requirements: entries.length, section17: section17.length, phases: phaseIds.length, amendments: amendments.length };
}

export async function checkGapMatrix(file = path.resolve("data/v2-1-live-gap-matrix.json")) {
  return validateGapMatrix(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) console.log("Version 2.1 gap matrix passed:", await checkGapMatrix());
