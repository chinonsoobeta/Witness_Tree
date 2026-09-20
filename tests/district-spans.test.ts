import assert from "node:assert/strict";
import test from "node:test";

import { DISTRICT_SPANS_PATH, handleDistrictSpans } from "../worker/district-spans";
import { ridingIntervalMeasurements } from "../lib/explore/riding-intervals";

const ask = (query: string, method = "GET") =>
  handleDistrictSpans(new Request(`https://example.invalid${DISTRICT_SPANS_PATH}${query}`, { method }));

test("the route answers exactly the span the page route would render", async () => {
  const response = ask("?from=1990&to=1998");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /max-age/);
  const body = (await response.json()) as { fromYear: number; toYear: number; measurements: { fromYear: number; toYear: number }[] };
  assert.equal(body.fromYear, 1990);
  assert.equal(body.toYear, 1998);
  assert.deepEqual(body.measurements, JSON.parse(JSON.stringify(ridingIntervalMeasurements({ fromYear: 1990, toYear: 1998 }))));
  assert.equal(body.measurements.length, 774);
  for (const entry of body.measurements) {
    assert.equal(entry.fromYear, 1990);
    assert.equal(entry.toYear, 1998);
  }
});

test("a span the record cannot answer is refused rather than moved", async () => {
  for (const query of ["", "?from=1990", "?from=1998&to=1990", "?from=1983&to=1990", "?from=2020&to=2023", "?from=abcd&to=1990", "?from=1990&to=1990"]) {
    const response = ask(query);
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(ask("?from=1990&to=1998", "POST").status, 405);
});
