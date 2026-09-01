# Phase 9 public-beta and launch exit status

The checksum-verified record at [`data/phase9-public-beta-launch-exit-status.json`](../data/phase9-public-beta-launch-exit-status.json) defines all **four** literal Phase 9 exit gates and currently records **0/4 (0%)**. This is an unweighted formal exit-criterion fraction, not an estimate of engineering effort or a beta/launch claim.

The safe local preparation is complete only in the narrow sense that quarterly correction metrics can be calculated from validated production cases without exposing case-level or subscriber data. It fails closed for illustrative, unfinished, or unresolved-only inputs. The required real-world results remain absent: operated beta corrections within service levels, no unresolved critical correction at launch, a source-agency confirmation of its admitted data as presented, and a quarterly reproducibility result for a published real figure.

The beta package is a checklist, not an invitation authority:

- Select only surfaces that pass every applicable earlier gate, and record each selected surface and evidence version.
- Obtain explicit owner authorization at the moment any invitation, production admission, deployment, or launch action would occur.
- Run the real correction process; publish only aggregate quarterly volume, outcome, median-resolution, and unresolved-critical metrics after the evidence threshold is met.
- Record source-agency review and confirmation against a versioned, admitted presentation; remediate beta findings and rerun the affected gates.
- Run the quarterly raw-archive-to-published-figure reproducibility test, then conduct the launch decision against this record.

## Quarterly reproducibility harness

[`scripts/run-phase9-quarterly-reproducibility.mjs`](../scripts/run-phase9-quarterly-reproducibility.mjs) implements the local harness without claiming that a quarterly run occurred. It requires an explicit data root, a frozen population manifest, a 64-character lowercase hexadecimal seed, a sample size, and a new result path:

```sh
npm run run:phase9-quarterly-reproducibility -- \
  --population /path/to/2026-Q3-population.json \
  --data-root /Volumes/Extended_SSD/Witness_Tree-data \
  --seed 64_LOWERCASE_HEX_CHARACTERS \
  --sample-size 10 \
  --output /path/to/new-result.json
```

The population schema is `witness-tree/phase9-quarterly-reproducibility-population/1`. It records a population id, quarter, generation time, population class, and one or more units. Every unit binds:

- an HTTPS published-figure URL, method version, positive byte length, and SHA-256;
- at least one exact raw-archive object key and version id, plus its data-root-relative restored path, positive byte length, and SHA-256; and
- a repository-relative Node `.mjs` recomputation runner, its SHA-256, and arguments containing `{dataRoot}` and `{outputPath}` exactly once.

Freeze and checksum the population before choosing the seed. The draw orders every unit by SHA-256 over the algorithm domain, seed, and unit id, then takes the requested prefix. The result binds the population-manifest SHA-256 and records the seed, algorithm, complete draw, and per-unit input, runner, and output verdict. Each sampled unit continues after another unit fails. Missing observations are recorded as `null`, never as zero. Temporary recomputation outputs are removed before the result is written, and the result path is created exclusively with mode `0600`.

The checked-in synthetic population and runner under `tests/fixtures/phase9-quarterly-reproducibility/` exercise the harness only. Fixture populations require an explicit test-only opt-in and do not establish production evidence. No real published-production population manifest or quarterly result is checked in, and the required data-root run remains an owner action. The Phase 9 criterion therefore remains `fail`.

The existing ChatGPT-hosted site remains a technical preview with illustrative data. This implementation sends no invitations, contacts no agency, admits no production data, publishes no metrics, deploys nothing, and does not launch.
