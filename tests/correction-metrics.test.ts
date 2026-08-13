import assert from "node:assert/strict";
import test from "node:test";
import { correctionMetrics } from "../lib/corrections/metrics.ts";
import { EXAMPLE_CORRECTION } from "../lib/corrections/fixtures.ts";
import type { CorrectionCase } from "../lib/corrections/types.ts";

function production(id: string, classification: CorrectionCase["classification"], status: CorrectionCase["status"], submittedAt: string, resolvedAt?: string): CorrectionCase {
  return { id, classification, status, statusKind: "production", submittedAt: new Date(submittedAt), ...(resolvedAt ? { resolvedAt: new Date(resolvedAt) } : {}), accountableRecipient: { name: "Operations owner", role: "corrections" }, priorFigureAddress: "/en/places/test", previouslyNotifiedSubscriberIds: [], publicRecord: { whatWasWrong: { en: "A", fr: "A" }, whatIsNow: { en: "B", fr: "B" }, whyChanged: { en: "C", fr: "C" }, publicationDate: "2026-08-12" } };
}

test("illustrative or unfinished inputs are explicitly non-publishable", () => {
  assert.deepEqual(correctionMetrics([EXAMPLE_CORRECTION]), { publishable: false, reason: "illustrative-cases" });
  assert.deepEqual(correctionMetrics([production("open", "critical", "acknowledged", "2026-08-01T00:00:00Z")]), { publishable: false, reason: "no-completed-cases" });
  assert.deepEqual(correctionMetrics([production("rejected", "minor", "rejected", "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z")]), { publishable: false, reason: "no-resolved-cases" });
});

test("published metrics compute median, volumes, and unresolved critical cases without case data", () => {
  const result = correctionMetrics([
    production("one", "critical", "resolved", "2026-08-01T00:00:00Z", "2026-08-03T00:00:00Z"),
    production("two", "material", "resolved", "2026-08-01T00:00:00Z", "2026-08-05T00:00:00Z"),
    production("three", "minor", "rejected", "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z"),
    production("four", "critical", "acknowledged", "2026-08-01T00:00:00Z"),
  ]);
  assert.equal(result.publishable, true);
  if (!result.publishable) return;
  assert.equal(result.resolvedCaseMedianDurationMs, 3 * 24 * 60 * 60 * 1000);
  assert.deepEqual(result.volumesByClass, { critical: 2, "indigenous-geography": 0, material: 1, minor: 1 });
  assert.deepEqual(result.volumesByOutcome, { submitted: 0, acknowledged: 1, resolved: 2, rejected: 1 });
  assert.equal(result.unresolvedCriticalCount, 1);
  assert.equal(JSON.stringify(result).includes("Operations owner"), false);
  assert.equal(JSON.stringify(result).includes("/en/places/test"), false);
});

test("invalid production cases do not become metrics", () => {
  assert.throws(() => correctionMetrics([{ ...production("bad", "critical", "resolved", "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z"), accountableRecipient: { name: "", role: "corrections" } }]), /named accountable recipient/);
});
