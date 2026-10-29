# French review, 2026-10-28

A review of the French on the public site, made after "Correct the French across the whole site" (#215). It checks against the English for grammar and agreement, register, terminology (the glossary and Canadian forestry usage, one term per concept), French typography, dates, anglicisms and meaning parity. Meaning parity got the most attention in the limitation and Unknown sentences, and in the draft condition-and-recovery, harvest-and-fire and matching-run strings.

## Scope and method

- **Rendered pages.** Text was extracted from every `/fr` route and its `/en` pair in a local production build and compared side by side.
- **Source strings.** All 1,354 French string literals in `app/`, `components/` and `lib/` were extracted by syntax tree, so client-only states were covered too: errors, loading messages, empty results and screen-reader labels.
- **Data files.** Every `fr` field in the `data/*.json` files the site renders was compared with its `en` field.
- **Scans.** Punctuation spacing, number formats and term frequency were scanned over all of the above.
- **Out of scope.** Place names, riding names and official source names were not altered. Dataset titles used in citations stay in their original language, as the project requires.

## Defects

Severity:

- **Critical:** the French says something false or contrary to the English, or shows an Unknown as a value.
- **Material:** the meaning is weakened or ambiguous, or one concept appears under two terms.
- **Minor:** grammar, typography or consistency, with no change to meaning.

### Fixed in this change

| # | Location | Current text | Proposed (applied) | Severity | Rationale |
|---|---|---|---|---|---|
| 1 | `lib/phase4/methods-matching-fr.ts:18` (matching run, draft) | « correspondent à un registre officiel de coupe, de feu, d’insectes ou de chablis » | « …un registre officiel de récolte, de feu, d’insectes ou de chablis » | material | The EN is "harvest". The same paragraph says "registre provincial de récolte". One term per concept: *récolte* is the site's term for harvest; *coupe* is used only in *possibilité de coupe*. |
| 2 | `components/transparency/MethodologyPage.tsx:80` (limits) | « Nous ne qualifions jamais une perte détectée d’exploitation, de déforestation… » | « …d’exploitation forestière, de déforestation… » | material | The EN is "logging". Bare *exploitation* is ambiguous (operation, mining). The home page already uses *exploitation forestière*. |
| 3 | `components/transparency/MethodologyPage.tsx:63` (unmapped text) | « 46 424 717,91 », « 22 204 952,19 », « 15 372 023,76 », « 8 843 646,69 », « 4 095,27 » with ordinary spaces | The same figures with no-break spaces (U+00A0) as thousands separators | minor (mechanical) | These were the only hand-typed figures on the site with breakable separators, so they could wrap mid-number. Everything else uses the fr-CA formatter's no-break spaces. |
| 4 | `components/transparency/HarvestFirePage.tsx:86` (harvest and fire, draft) | « La récolte et le feu ne sont jamais additionnés, car un même carré peut porter les deux. » | « La récolte et le feu ne sont jamais additionnés l’un à l’autre, car… » | material | The EN is "never added to each other". Without *l’un à l’autre*, the French can be read as "harvest figures are never summed", which contradicts the sentence before it (years may be added within harvest). |
| 5 | `components/explore/ExploreView.tsx:189` (harvest-fire note, draft) | « La récolte et le feu ne sont jamais additionnés. » | « La récolte et le feu ne sont jamais additionnés l’un à l’autre. » | material | Same limitation sentence and ambiguity as #4. The note says just before that harvest years, and separately fire years, *are* added. |
| 6 | `components/explore/ExploreView.tsx:187` (recovery note, draft) | « Boisé de nouveau signifie boisé pendant au moins cinq années de suite » | « « Redevenu boisé » signifie boisé pendant au moins cinq années de suite » | material | The note defines a label that does not appear anywhere. The figures, the map legend and the home page all say *Redevenu(es) boisé(es)*. The definition now quotes the label the reader sees, as the EN does with "Treed again". |
| 7 | `components/transparency/BcHarvestVolumeIndicator.tsx:62–63` | « Récolte visée par les possibilités de coupe », « Récolte non visée par les possibilités de coupe » | « …par la possibilité de coupe » (both) | minor | The EN is singular ("the allowable cut"). The page title, the share column and the definitions on the same page use the singular. |
| 8 | `lib/wildfire/view-model.ts:76` (not rendered) | « Dernière actualisation réussie de ${PRODUCT_NAME.fr} » → « …de Arbre témoin » | « …réussie d’${PRODUCT_NAME.fr} » | minor | Missing elision before a vowel. `components/wildfire/WildfireView.tsx:70` already writes *d’*. |

Evidence records:

- Edits 1–3 change files bound by digest in `data/phase4-exit-status.json`.
- Edits 5–6 change a file bound by digest in `data/phase7-indigenous-explore-comparison-exit-status.json`.
- The digests were refreshed, and each affected check's reason gained a dated 2026-10-28 note. No status changed.

### Reported, not fixed

| # | Location | Current text | Proposed | Severity | Rationale |
|---|---|---|---|---|---|
| 9 | `data/harvest-fire-province-annual-series.json` `sumRule.fr`, from `scripts/build-harvest-fire-province-series.mjs:144` | « La récolte et le feu ne sont jamais additionnés, car une même cellule peut porter les deux. » | « …jamais additionnés l’un à l’autre, car… » | minor | Same ambiguity as #4. This field is not rendered (the page uses its own copy, now fixed). The file is builder-generated, so the fix belongs in the builder, followed by a rebuild with the data root mounted. |
| 10 | `lib/downloads/releases.ts:29` `note.fr` | « …pour quatre provinces; il ne s’agit… » | « …provinces ; il ne s’agit… » | minor | Missing narrow no-break space. This is part of a published release record and not shown on the page, so it was left with the release. |
| 11 | `lib/downloads/fixtures.ts:2`, `lib/grid/class-area.ts:54,89`, `lib/grid/conformance.ts:73,83,103,113`, `lib/source-review/review.ts:260,311`, `lib/boundaries/join.ts:82` | ASCII `;` with no space, ordinary space before `:` and inside « », straight apostrophes (*L'année*, *n'est*) | French spacing and typographic apostrophes | minor | These are internal diagnostic and fixture strings, not rendered on the public site. Fix them if any is ever surfaced. |
| 12 | `data/phase2-official-published-harvest-comparison.json` `publicationBoundary.entitlement.fr` | « …perte observée par Witness Tree… » | « …par Arbre témoin… », or reword to avoid the name | minor | The product name is hard-coded in English inside French text. It is not rendered (the component uses its own copy). The invariant says the name comes only from `PRODUCT_NAME`. |
| 13 | `lib/fire-impact/contract.ts:8` | « …n’est pas une carte des dommages ou de mortalité. » | « …des dommages ou de la mortalité. » | minor | Parallel articles, matching `lib/wildfire/view-model.ts:84`. Not rendered. |
| 14 | `lib/wildfire/view-model.ts:79` vs `components/wildfire/WildfireView.tsx:76` | « Information officielle d’urgence » vs « Information d’urgence officielle » | One wording; the rendered « Information d’urgence officielle » is the more natural | minor | Same label, two word orders. Only the second is rendered. |

### Counts

| Severity | Found | Fixed | Left |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| Material | 5 | 5 | 0 |
| Minor | 9 | 3 | 6 |
| **Total** | **14** | **8** | **6** |

There are also 17 judgment calls, listed below, none applied. No critical defect was found:

- no Unknown is rendered as zero in French;
- no French limitation sentence says less than its English;
- no dataset title used in a citation has been translated.

## Judgment calls

These need a decision from the owner or the professional reviewer. Each lists alternatives.

1. **feu / incendie.** The French text uses *feu* about 136 times and *incendie* about 54 times.
   - Where each appears:
     - *Récolte et feu*, *Feu (ha)* and *au feu* name the NRCan disturbance product and the cause category.
     - *Incendies* names the Explore mode, along with *Incendie consigné*, *Dont incendies (ha)* and the `/fr/incendies` page.
   - Alternatives:
     - (a) Keep the split: *feu* for the cause or product class, *incendie* for events and records. Document it in the glossary.
     - (b) Use *feu* everywhere except the emergency-information page.
     - (c) Use *incendie de forêt* everywhere.
2. **BC open licence name.** `components/transparency/BcHarvestVolumeIndicator.tsx:72,75` translates the licence as « Licence du gouvernement ouvert – Colombie-Britannique ». `components/governance/terms-licences.ts:37–38` keeps « Open Government Licence – British Columbia ». BC publishes this licence in English only.
   - (a) Keep the English name everywhere, with a gloss on first use.
   - (b) Translate everywhere, with the English name in parentheses.
   - This is a legal-wording choice for counsel.
3. **Alberta attribution statement.** `lib/explore/boundaries.ts:79` keeps « Contains information licensed under the Open Government Licence – Alberta. » in English inside the French attribution. It may be deliberately verbatim, since Alberta's licence prescribes the statement.
   - (a) Keep it verbatim.
   - (b) Add a French gloss after it.
4. **OGL–Canada attribution wording.** The site writes « Contient de l’information visée par la Licence du gouvernement ouvert – Canada » in `DataPage.tsx:108`, `ProvincialHarvestVolume.tsx:62` and `OfficialPublishedHarvestComparison.tsx:75`. The licence's own French text should be checked; it may read « Contient des informations visées par… ».
   - (a) Use the licence's prescribed French statement word for word.
   - (b) Keep the current wording.
5. **image satellite / image satellitaire.** Both forms appear: *images satellites* (8) in `components/policy/EvidenceMarks.tsx:34` and elsewhere, and *imagerie satellitaire*, *observation satellitaire* and *source satellitaire* in the rest of the site.
   - (a) Use *satellitaire* throughout, which is more consistent with the glossary's « observation satellitaire ».
   - (b) Keep the mix; both are accepted.
6. **Publisher.** *Le diffuseur* is used in `components/transparency/SourceCurrency.tsx:34–43`, and *l’éditeur* in `ProvincialHarvestVolume.tsx:52,62`, `MethodologyPage.tsx:71` and the BC volume page.
   - (a) *l’éditeur* everywhere.
   - (b) *le diffuseur* everywhere, which is closer to "the host that serves the files" on the currency panel.
7. **Confidence labels.**
   - The methods sentence lists « élevé, moyen, limité ou inconnu », which agrees with *niveau*.
   - The badges read « Élevée, Moyenne, Limitée, Inconnue », which agrees with *confiance*.
   - Both are grammatical, but the sentence does not quote the labels the reader sees.
   - (a) Quote the badge labels: « (Élevée, Moyenne, Limitée ou Inconnue) ».
   - (b) Leave as is.
8. **Space between number and unit.** Many strings write `${n} ha`, `${n} m` and `… hectares` with an ordinary space, so a figure can wrap away from its unit.
   - (a) Use a no-break space between number and unit site-wide (OQLF practice); this is a mechanical change across many files and data records.
   - (b) Leave it.
9. **"BC" in the region column** of the BC volume table on the French page.
   - (a) Show « C.-B. ».
   - (b) Keep the source's code value.
10. **`components/explore/ConditionRecoveryFigures.tsx:67`**: « Après une perte quelconque ».
    - (a) « Après toute perte ».
    - (b) « Après n’importe quelle perte ».
    - *Quelconque* can read as "ordinary or mediocre".
11. **`components/transparency/OfficialPublishedHarvestComparison.tsx:95`**: « Non affichée, selon les conditions d’utilisation de la source. »
    - (a) « …en raison des conditions d’utilisation de la source », which says *because of* more plainly.
    - (b) Keep.
12. **`components/transparency/OfficialPublishedHarvestComparison.tsx:89`**: « Perte de forêt détectée (ha) ». The rest of the site uses *perte forestière détectée*.
    - (a) Align it.
    - (b) Keep, if the variation is wanted in a table header.
13. **Agreement after a percentage.**
    - The strings:
      - `components/explore/ExploreView.tsx` `provinceUnknown`, « ${share} inconnu »;
      - `lib/search/suggest.ts:74`, « … non cartographié »;
      - `components/site/RidingsMostLost.tsx:42`, « non cartographié ».
    - The masculine default is accepted.
    - (a) « ${share} de superficie inconnue » or « ${share} du territoire non cartographié », for clarity.
    - (b) Keep.
14. **Condition-and-recovery agreement note** (`data/phase4-condition-recovery-explore.json` `resultsAgreement.note.fr`, builder-generated, draft).
    - The French uses the present tense (« concordent ») where the EN uses the past ("agreed").
    - « sans doute davantage » is firmer than "if anything".
    - (a) « …ont concordé… », and « …la sous-estime, le cas échéant, encore davantage ».
    - (b) Keep. The present tense is usual for findings.
15. **`lib/explore/unmapped-reasons.ts:22`**: « sous le 52e parallèle ».
    - (a) Use the superscript « 52ᵉ ».
    - (b) Keep plain text.
16. **`lib/explore/forest-regions.ts:41`**: « Laurentides et le Nord ».
    - (a) « Les Laurentides et le Nord ».
    - (b) « Laurentides et Nord », so both parts are without articles like the sibling labels.
17. **`components/explore/ShapeMeasureClient.tsx:148`**: « Votre forme correspond à des carrés entiers de ${block} m, ces nombres sont donc des dénombrements exacts… » joins two clauses with a comma.
    - (a) Use « …de ${block} m : ces nombres sont donc… ».
    - (b) Keep.

## Status of the bilingual review gate

This is a reviewer-assisted pass by an AI (Claude), not the professional translation with subject-matter review that the external bilingual review gate requires (`docs/EXTERNAL_GATES.md`). The French on the site remains Claude's translation pending that review. This pass does not close the gate, and the gate stays open.
