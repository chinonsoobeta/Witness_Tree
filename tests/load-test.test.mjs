import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { ROUTES, BUDGET, validateLoadOptions, latencyPercentiles, runLoadScenario } from "../scripts/run-load-test.mjs";

async function localServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { origin: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

test("the target and request budget refuse production, credentials, remote hosts and oversized runs", () => {
  assert.deepEqual(validateLoadOptions(), { origin: "http://127.0.0.1:4173", requests: 120 });
  for (const origin of ["https://www.witnesstree.ca", "http://witnesstree.ca:80", "https://preview.example.test", "http://localhost.evil.test", "http://user:password@localhost", "http://localhost/en", "http://localhost/?q=1", "http://localhost/#fragment"]) {
    assert.throws(() => validateLoadOptions({ origin }));
  }
  for (const requests of [0, 6, 13, 121, Infinity]) assert.throws(() => validateLoadOptions({ requests }));
  assert.equal(validateLoadOptions({ origin: "http://[::1]:4173", requests: 12 }).requests, 12);
  assert.equal(BUDGET.connections, 2);
  assert.equal(BUDGET.deadlineSeconds, 30);
});

test("p50, p95 and p99 use the stated nearest-rank calculation; absent latency stays unknown", () => {
  const latency = latencyPercentiles(Array.from({ length: 100 }, (_, i) => 100 - i));
  assert.deepEqual([latency.p50, latency.p95, latency.p99], [50, 95, 99]);
  assert.deepEqual([latencyPercentiles([]).p50, latencyPercentiles([]).p95, latencyPercentiles([]).p99], [null, null, null]);
  assert.throws(() => latencyPercentiles([NaN]));
});

test("the real autocannon client obeys the request cap and covers every route without inflating readiness", async () => {
  const seen = [];
  const server = await localServer((request, response) => { seen.push({ method: request.method, url: request.url }); response.end("local fixture"); });
  try {
    const result = await runLoadScenario({ origin: server.origin, requests: 12 });
    assert.equal(result.status, "passed");
    assert.equal(seen.length, 12);
    for (const route of ROUTES) assert.equal(seen.filter((item) => item.url === route && item.method === "GET").length, 2);
    assert.equal(result.responses, 12);
    assert.equal(result.errorRate, 0);
    assert.equal(result.latency.samples, 12);
    assert.ok(result.latency.p50 <= result.latency.p95 && result.latency.p95 <= result.latency.p99);
    assert.deepEqual(result.claims, { productionLoadTest: false, fiftyTimesLoadDemonstrated: false, phase8CriterionPass: false });
  } finally { await server.close(); }
});

test("HTTP errors and redirects fail and retain their latency; redirects are never followed", async () => {
  let requests = 0;
  const server = await localServer((_request, response) => {
    requests += 1;
    response.writeHead(requests % 2 ? 503 : 302, { location: "https://www.witnesstree.ca/en" });
    response.end();
  });
  try {
    const result = await runLoadScenario({ origin: server.origin, requests: 12 });
    assert.equal(result.status, "failed");
    assert.equal(requests, 12);
    assert.equal(result.non2xx, 12);
    assert.equal(result.errorRate, 1);
    assert.equal(result.latency.samples, 12);
  } finally { await server.close(); }
});

test("an unavailable local server produces a failed incomplete observation without invented latency", async () => {
  const server = await localServer((_request, response) => response.end());
  await server.close();
  const result = await runLoadScenario({ origin: server.origin, requests: 12 });
  assert.equal(result.status, "failed");
  assert.equal(result.complete, false);
  assert.equal(result.responses, 0);
  assert.ok(result.connectionErrors > 0);
  assert.equal(result.errorRate, 1);
  assert.equal(result.latency.p95, null);
});

test("the independent deadline stops an incomplete run even when amount overrides duration", async (t) => {
  const server = await localServer(() => {});
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const observation = runLoadScenario({ origin: server.origin, requests: 12 });
    t.mock.timers.tick(BUDGET.deadlineSeconds * 1000 + 1);
    const result = await observation;
    assert.equal(result.deadlineReached, true);
    assert.equal(result.complete, false);
    assert.equal(result.status, "failed");
    assert.equal(result.latency.p99, null);
  } finally { t.mock.timers.reset(); await server.close(); }
});
