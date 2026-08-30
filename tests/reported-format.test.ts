import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { formatReported } from "../lib/domain/reported.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { formatHectares, formatNumber, formatPercent } from "../lib/domain/number.ts";

test("reported values use the requested Canadian locale for Unknown and numeric output", () => {
  const unknown = { kind: "unknown" as const, evidence: "unknown" as const, reason: { en: "No record", fr: "Aucun registre" }, coverageGrade: "national-baseline" as const };
  const figure = { kind: "figure" as const, value: 1234.5, unit: "ha" as const, evidence: "official-record" as const, confidence: { level: "high" as const, ruleId: "CONF-HIGH-001" as const, reason: { en: "Direct record", fr: "Registre direct" } }, provenance: { dataset: "Example", version: "1", retrievedDate: "2026-08-25", licence: "ogl-canada-2.0" as const } };
  assert.equal(formatReported(unknown, "en"), "– No record");
  assert.equal(formatReported(unknown, "fr"), "– Aucun registre");
  assert.equal(formatReported(figure, "en"), new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 }).format(1234.5));
  assert.equal(formatReported(figure, "fr"), new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 1 }).format(1234.5));
});

test("the shared public formatter caps precision and localizes separators", () => {
  assert.equal(formatNumber(12345.6789, "en"), "12,345.68");
  assert.equal(formatHectares(12345.6789, "en"), "12,345.68 ha");
  assert.equal(formatPercent(4.234567, "en"), "4.23%");
  assert.equal(formatNumber(12345.6789, "fr"), "12 345,68");
  assert.equal(formatPercent(4.234567, "fr"), "4,23 %");
});
