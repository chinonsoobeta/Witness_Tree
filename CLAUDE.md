# Witness Tree continuation guide

Read [the implementation status](docs/IMPLEMENTATION_STATUS.md) before changing this repository. It is the durable handoff record: verified commands, completed foundations, remaining phases, and non-code release gates.

## Core invariants

- The approved build specification is `/Users/chinonsoobeta/Documents/Codex/2026-08-11/realtime-voice-chat/outputs/Witness Tree Implementation Plan.docx`. Its checked-in convenience copy is `docs/specification/Witness Tree Implementation Plan.docx`. The non-normative visual reference is `/Users/chinonsoobeta/Documents/Codex/2026-08-11/realtime-voice-chat/outputs/Witness Tree - Front-End Visual Reference.html`; it never overrides the plan.
- Keep the product name in `lib/domain/brand.ts` (`PRODUCT_NAME`). Do not put it in persistent identifiers. Do not ship as **Mistik** without written permission.
- This remains an illustrative-fixture technical preview until verified source data and release gates exist. Never present fixtures, examples, policies, or contracts as acquired/processed public data.
- An Unknown is a reasoned nonnumeric state, never `0`. Keep evidence, provenance, confidence reasons, coverage, dates, licences, and limitations explicit.
- Use BC Sans through the single root CSS import. Preserve its notices in `docs/THIRD_PARTY.md`; do not replace it with an unlicensed asset.
- Prefer the smallest direct implementation that satisfies the plan. Do not add a dependency, service, abstraction, source, or production claim without a demonstrated requirement and the needed approval.
- Keep the working tree intentional and clean. Inspect `git status --short` before and after work; do not overwrite unrelated changes.

## Working practice

Run the relevant checks in the status document before handoff. For delegated implementation work, use GPT-5.6 Terra at medium reasoning and require a primary audit after every delegation, as specified by plan section 20. Do not treat passing local tests as closure of legal, Indigenous-engagement, translation, accessibility, source-licence, or operational gates.
