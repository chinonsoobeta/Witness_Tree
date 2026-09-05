import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Two denominators describe the same forest and only one of them belongs
 * under a cumulative headline. Each annual row measures against its own
 * from-year forest mask, which moves as forest regrows; the cumulative row is
 * a union against the fixed 1984 mask. Summing the annual rows overshoots the
 * union by millions of hectares, for two separate reasons, and a reader who
 * adds up the chart will land nowhere near the headline.
 *
 * This gate holds that line. It proves each figure still carries its own
 * basis, proves the union never exceeds the sum, and proves the difference is
 * stated with its causes rather than left for a reader to trip over.
 */

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);
const INTERVAL_BASIS = "moving-from-year-forest-mask";
const CUMULATIVE_BASIS = "fixed-1984-forest-mask";
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const round2 = (value) => Number(value.toFixed(2));

export function validateProvinceSeries(series, readback, readbackBytes) {
  assert.equal(series?.schemaVersion, "witness-tree/phase2-province-series/1");
  assert.equal(series.status, "countable-unreviewed-minimum");
  assert.equal(series.productId, readback.productId, "the series names a different product than the readback");

  // Bound by digest, not by path, so a rebuilt readback cannot drift underneath.
  assert.equal(series.source.path, "data/phase2-province-series-readback.json");
  assert.equal(series.source.byteLength, readbackBytes.byteLength, "the bound readback length drifted");
  assert.equal(series.source.sha256, createHash("sha256").update(readbackBytes).digest("hex"), "the bound readback digest drifted");

  assert.equal(series.firstYear, 1984, "the series must start at 1984");
  assert.equal(series.lastYear, 2022, "the series must end at 2022");
  assert.equal(series.intervalCount, 38, "1984-2022 is 38 adjacent annual intervals");

  // The warning that keeps the two bases apart must survive edits to this file.
  assert.match(series.bases.warning, /does not reproduce the cumulative/i, "the series must state that the bases do not add up");
  assert.match(series.bases.interval, /moves as forest regrows/i, "the series must state why the interval denominator moves");
  assert.match(series.bases.cumulative, /union/i, "the series must state that the cumulative figure is a union");

  assert.equal(series.provinces.length, readback.provinces.length, "the series and the readback disagree on province count");
  assert.ok(series.provinces.length > 0, "the series is empty");

  for (const [index, province] of series.provinces.entries()) {
    const source = readback.provinces[index];
    const where = province.code;
    assert.equal(where, source.code, `province ${index} drifted from the readback`);
    assert.equal(province.id, source.id, `${where} boundary id drifted`);

    // Coverage is partial everywhere, so no figure may be presented as a total
    // and no unknown may be presented as zero.
    assert.equal(province.coverageGrade, "partial-with-unknown", `${where} coverage grade drifted`);
    assert.equal(province.coverageGrade, source.coverageGrade, `${where} coverage grade left the readback`);
    assert.ok(province.unknownRequiredInputHectares > 0, `${where} reports no unknown, but every province is partial`);
    assert.equal(province.unknownRequiredInputHectares, source.unknownRequiredInputHectares, `${where} unknown drifted`);
    assert.equal(province.districtHectares, source.districtHectares, `${where} district area drifted`);

    const cumulative = province.cumulative;
    assert.equal(cumulative.basis, CUMULATIVE_BASIS, `${where} cumulative basis drifted`);
    assert.equal(cumulative.fromYear, 1984, `${where} cumulative must start at 1984`);
    assert.equal(cumulative.toYear, 2022, `${where} cumulative must end at 2022`);
    assert.equal(cumulative.observedLossHectares, source.cumulative.observedLossHectares, `${where} cumulative hectares drifted`);
    assert.equal(cumulative.known1984ForestHectares, source.cumulative.known1984ForestHectares, `${where} cumulative denominator drifted`);

    // The headline percentage must be the union over the 1984 mask and nothing else.
    const expectedPercent = (cumulative.observedLossHectares / cumulative.known1984ForestHectares) * 100;
    assert.ok(
      Math.abs(cumulative.observedLossPercent - expectedPercent) < 1e-6,
      `${where} cumulative percent is not the union over the 1984 forest mask`,
    );
    assert.ok(
      cumulative.observedLossHectares < cumulative.known1984ForestHectares,
      `${where} reports losing more forest than it had in 1984`,
    );
    assert.ok(cumulative.maximumLossEventsInOneCell >= 1, `${where} records no loss events`);
    assert.ok(
      cumulative.repeatLossCellHectares >= 0 && cumulative.repeatLossCellHectares <= cumulative.observedLossHectares,
      `${where} repeat-loss area is outside the union it belongs to`,
    );

    assert.equal(province.intervals.length, 38, `${where} does not carry 38 intervals`);
    let sum = 0;
    let previousYear = 1983;
    const denominators = new Set();
    for (const interval of province.intervals) {
      assert.equal(interval.basis, INTERVAL_BASIS, `${where} ${interval.fromYear} interval basis drifted`);
      assert.equal(interval.toYear, interval.fromYear + 1, `${where} ${interval.fromYear} is not an adjacent annual pair`);
      assert.equal(interval.fromYear, previousYear + 1, `${where} interval years are not contiguous at ${interval.fromYear}`);
      assert.ok(interval.observedLossHectares >= 0, `${where} ${interval.fromYear} reports negative loss`);
      assert.ok(interval.knownForestedHectares > 0, `${where} ${interval.fromYear} has no denominator`);
      previousYear = interval.fromYear;
      denominators.add(interval.knownForestedHectares);
      sum += interval.observedLossHectares;
    }

    // If every interval shared one denominator the moving basis would be a
    // fiction, and the reconciliation note below would be unnecessary.
    assert.ok(denominators.size > 1, `${where} interval denominators do not move, so the stated basis is wrong`);

    // The arithmetic that a reader would do, checked so the stated difference
    // cannot quietly stop matching the numbers on the page.
    const reconciliation = province.reconciliation;
    assert.equal(reconciliation.naiveSumOfPublishedIntervalsHectares, round2(sum), `${where} stated interval sum does not match its own intervals`);
    assert.equal(reconciliation.cumulativeObservedLossHectares, cumulative.observedLossHectares, `${where} reconciliation cites a different cumulative figure`);
    assert.equal(
      reconciliation.differenceHectares,
      round2(reconciliation.naiveSumOfPublishedIntervalsHectares - cumulative.observedLossHectares),
      `${where} stated difference does not match its own figures`,
    );
    assert.ok(
      cumulative.observedLossHectares <= reconciliation.naiveSumOfPublishedIntervalsHectares,
      `${where} union exceeds the interval sum, which is arithmetically impossible`,
    );
    assert.equal(reconciliation.causes.length, 2, `${where} must state both reasons the figures differ`);
    assert.ok(
      reconciliation.causes.some((cause) => /counted once/i.test(cause)),
      `${where} must state that overlapping cells are counted once`,
    );
    assert.ok(
      reconciliation.causes.some((cause) => /regrew/i.test(cause)),
      `${where} must state that the moving denominator admits regrown forest`,
    );
  }

  // Nothing here is admitted, released, or reviewed, and it may not say otherwise.
  assert.deepEqual(
    series.claims,
    { countable: true, admitted: false, released: false, productionEligible: false, complete: false, expertReviewed: false },
    "the series claims drifted",
  );
  assert.match(series.completenessBasis, /minimum/i, "the series must say why it is a minimum");

  return {
    provinces: series.provinces.length,
    intervals: series.intervalCount,
    cumulative: series.provinces.map((province) => `${province.code} ${province.cumulative.observedLossPercent.toFixed(2)}%`).join(", "),
  };
}

export function checkProvinceSeries() {
  const readbackBytes = readFileSync(resolve(ROOT, "data/phase2-province-series-readback.json"));
  return validateProvinceSeries(readJson("data/phase2-province-series.json"), JSON.parse(readbackBytes), readbackBytes);
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  const result = checkProvinceSeries();
  console.log(
    `Province series: ${result.provinces} provinces x ${result.intervals} intervals, 1984-2022. ` +
      `Cumulative union over the 1984 forest mask: ${result.cumulative}.`,
  );
}
