# Bounded local load observations

Build the application and serve it locally in one terminal:

```sh
npm ci
npm run build
npm run start -- --hostname 127.0.0.1 --port 4173
```

In another terminal:

```sh
npm run verify:load-test -- --help
npm run verify:load-test
node --test tests/load-test.test.mjs
```

The default is `http://127.0.0.1:4173`. `--origin` accepts another loopback HTTP
port for a locally served preview. This harness deliberately has no remote or
production override. A production run needs a separately scoped scenario and
explicit owner authorization at the time, retained in that run's artifact.
This implementation performs no production load test or deployment.

The [autocannon](https://github.com/mcollina/autocannon) scenario has a hard budget
of 120 GET requests, two connections, six requests per second, no pipelining,
a five-second socket timeout and an independent 30-second wall-clock deadline.
It cycles through `/en`, `/fr`, `/en/explore`, `/fr/explorer`, `/en/compare` and
`/fr/comparer`, expecting 20 responses per route. It sends no warmup requests,
follows no redirects and fetches no dependent assets. `--requests` can reduce
the total to a multiple of 12, down to 12; it cannot increase the cap.

Each invocation writes a new timestamped JSON file under ignored `outputs/`.
`--output FILE` accepts an alternative unused path with an existing parent,
outside all data-root aliases. The shared integrity-manifest output guard
prevents SSD writes and overwriting an earlier observation.

The artifact records route and status counts, connection errors, timeouts,
completeness, elapsed time, engine version, request budget, and p50/p95/p99
latency in milliseconds. Percentiles use nearest rank on every observed response,
including non-2xx responses. They are raw observed values, not autocannon's
coordinated-omission-adjusted histogram. With no responses, latency stays null.
The error rate is non-2xx responses plus connection errors divided by all
responses plus connection errors. Timeouts are a subset of connection errors
and are counted once. An unfinished request is also visible through incomplete
coverage; it is not silently counted as a successful response.

Only a complete run with zero errors exits 0. HTTP failures, redirects, connection
failures, interruption, deadline exhaustion or incomplete route coverage exit 1
and retain the failed artifact. Script, lockfile and available build-manifest
hashes identify local files, without claiming an arbitrary listening process
serves those exact bytes.

This small local sample is a harness check, not a capacity estimate, a 50-times
load demonstration, or evidence about the live Site. The generator and server
share a machine, and cold caches and concurrent work affect timings. There is
no invented latency ceiling or claim that Phase 8 load testing is complete.
Phase 8 remains 8 of 16 and its load-testing criterion remains failed.

## Implementation observation, 2026-09-04

`npm run verify:load-test` completed against the locally served production build
in 20.02 seconds: 120 HTTP 200 responses, exactly 20 per route, zero connection
errors or timeouts, and a 0% error rate. Observed p50 was 14.605958 ms, p95 was
64.122042 ms, and p99 was 86.310792 ms. The full JSON observation is retained
locally as `outputs/load-run-2026-09-04T21-43-56.309Z.json`. These timings do not
describe the live Site.

All six load-harness tests passed, including the independent deadline regression.
All 122 existing CI npm checks passed. The portable suite passed 1,548 assertions
with four skipped subtests and the existing 28 excluded files. Build, typecheck,
lint, production audit at high and whole-tree audit at critical passed. The
inherited accessibility run passed 19/36 and failed 17/36 on the existing
hidden-map and narrow-table defects; this branch does not contain the separate
U9 fix and does not claim those accessibility failures are resolved.

The production dependency graph's 31 package entries are byte-identical to
public base `5549be3`, and its audit reports zero vulnerabilities. The full
development tree reports 15 dependency findings (eight moderate, seven high). Three
moderate entries are the `uuid` advisory and its propagated `hyperid` and
`autocannon` dependency findings. They remain visible and no audit threshold,
exclusion, dependency override or forced framework upgrade was introduced.
The existing policy and independent security-review boundary still apply.
