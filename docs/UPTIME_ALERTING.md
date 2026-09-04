# Synthetic uptime

The read-only probe is scheduled every 15 minutes. GitHub scheduling is best
effort, so this is a configured cadence, not a maximum detection-time guarantee.
The probe preserves its route/status/timestamp receipt even on failure.

A separate `workflow_run` handler on `main` reads completed, same-repository
scheduled or manually dispatched runs. Two consecutive failed probe runs open
one bot-owned incident issue. Later failures update it; a successful run with a
complete healthy route receipt closes it. A later outage reopens that issue.
One transient failure creates no issue. Missing receipts cannot prove recovery.
Out-of-order completion events and repeated deliveries do not change newer state.

Only the handler has `issues: write`; the probe retains `contents: read` and no
write permission. The handler checks out trusted `main`, never the triggering
commit, and reads the artifact as JSON data only. No token or raw response body
is included in an issue. These boundaries follow GitHub's
[workflow-run security guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).

Both workflows must reach the repository's default branch to activate the
scheduled/completion triggers. An issue follows GitHub subscription preferences;
this does not establish a staffed on-call rota or a guaranteed paging service.
No deployment or host-tier observation is claimed by this configuration.

```sh
npm run verify:synthetic-uptime -- --help
npm run verify:synthetic-uptime -- --output /tmp/uptime-unique-run.json
npm run check:uptime-alerting
npm run check:observability-deployment
```

The origin defaults to the public site and the output to
`synthetic-uptime-result.json`. Existing receipts are never overwritten. Use
`--record` for another route definition or `--origin` for an HTTPS preview. Help
performs no requests and writes no files. Tests simulate GitHub and route
responses; running them sends no issues and changes no committed observation.
