# Method release note: interval-union-and-sum-1984-2022-v1

Release note ID: `interval-union-and-sum-1984-2022-v1-note`

Previous method version: `phase2-owner-approved-versioned-nonproduction-v1`
Next method version: `interval-union-and-sum-1984-2022-v1`

Machine record: [`data/phase3-interval-method-change.json`](../data/phase3-interval-method-change.json)
Parameters: [`data/phase3-interval-method-parameters.json`](../data/phase3-interval-method-parameters.json)

## What changed

The annual method answers one question: how much mapped forest was observed as
lost between one year and the next. It has no way to answer a question about a
span, because a cell lost in 1991 and again in 2004 is a different quantity
depending on whether you are counting cells or counting events.

The new method version adds a span block to the registered parameters. Nothing
else moved. The matching, precedence, mask, vectorization, aggregation and
boundary parameters are byte-identical to the annual method, which is why the
annual method keeps the canonical parameter hash it was admitted with
(`8d12ff6b6fb10208410bedf5f012e96a9682fdec457cccce688509d2dfa0b8fa`). The span
block is the entire delta.

The span block registers four things that were previously unstated:

1. **Span enumeration.** Every ordered pair of years in the record, so 741 spans
   over the 38 annual steps from 1984 to 2022. The count is derived from the
   step count and checked, not asserted.
2. **Union accounting.** A cell that was observed as loss more than once inside a
   span is counted once. This is the only quantity the method allows to carry a
   percentage.
3. **Summed accounting.** Annual counts added along the span. A cell lost twice
   contributes twice. This quantity is reported in hectares and never as a
   percentage, because its denominator does not exist: the sum can exceed the
   forest that was standing at the opening year.
4. **Denominator.** The known forest at the opening year of the span. It does not
   move as the span widens, which is what makes the union percentage comparable
   across spans that share an opening year.

Net change is not part of this method and is not reported. Regrowth is not
measured here, so a net figure would be a subtraction with an unmeasured term.

## Why recomputation is required

The span products are not derivable from the shipped annual product. The annual
series gives the sum by addition, but the union needs the per-cell record, since
addition cannot know which cells recur. The interval aggregates were recomputed
from the per-cell annual masks on the external store, not folded down from the
published annual table.

The recomputation was verified against the already-admitted annual product
rather than assumed to agree with it. For every district, every one-year span
reproduces the annual measurement exactly, and the 2021 to 2022 span reproduces
`data/phase2-riding-map-measurements.json` exactly on known forest, observed
loss, percentage and coverage grade. Across the 573,534 district-spans, no span
violates union less than or equal to sum, union less than or equal to known
forest, or agreement with the annual window.

## What this release note does not claim

The method version bump does not admit the product, release it, or make it
production eligible. `productionEligible` is `false` in both manifests and in the
change marker, the shipped interval table carries `admitted: false`,
`released: false`, `productionEligible: false`, and the detection itself remains
unreviewed. Authorization to compute a product is not evidence about how often
it is right.

## Note bilingue

**EN.** Measurements can now be read over a span of years, not only between one
year and the next. Forest lost at least once counts a place once however many
times it was cut, and is the only figure shown as a percentage. Yearly losses
added together counts a place again each time, and is shown in hectares only.

**FR.** Les mesures peuvent maintenant se lire sur une plage d'années, et non
seulement d'une année à la suivante. La forêt perdue au moins une fois compte un
lieu une seule fois, quel que soit le nombre de coupes, et c'est le seul chiffre
présenté en pourcentage. Les pertes annuelles additionnées comptent un lieu à
chaque fois, et sont présentées en hectares seulement.
