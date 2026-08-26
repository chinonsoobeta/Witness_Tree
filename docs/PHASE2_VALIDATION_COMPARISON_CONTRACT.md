# Phase 2 validation and comparison contract

[`data/phase2-validation-comparison-contract.json`](../data/phase2-validation-comparison-contract.json) records the non-production framework for Section 15.3. It deliberately carries no admitted input, review finding, comparison result, accuracy figure, or production claim.

The plan fixes a SHA-256 ranking seed and four synthetic strata in each of BC, Alberta, Ontario, and Québec: two year bands crossed with attributed/unattributed change. It ranks 125 candidate identifiers inside each stratum and selects 25 from each, for exactly 100 locations per province. The checker independently regenerates the selections and verifies their hashes. The identifiers are illustrative selection evidence, not locations or validation results. Expert review is explicitly `not-started`, with zero completed locations.

Every future harvest and NBAC comparison row must be published. A missing input is represented by a published pending row with null values and a bilingual explanation; it cannot disappear. A completed row must include both areas, its derived absolute difference, and its derived relative difference.

Hansen Global Forest Change can only be recorded as an independent NTEMS cross-check, never as a Witness Tree source. Source-reported accuracy can be presented only as source context; it is never a product-accuracy claim.

Run the contract and focused tests with:

```sh
npm run check:phase2-validation-comparison
```

This is implementation groundwork only. It does not satisfy the Phase 2 expert-review or comparison exit criteria until real admitted outputs, real independent comparison records, published results, and scientific review evidence exist.
