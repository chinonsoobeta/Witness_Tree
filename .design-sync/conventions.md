# Designing with Witness Tree

Witness Tree is a public-interest service that reports **what happened to
Canada's forests**, place by place, from satellite observation and official
records. Every number it shows is an evidence claim, and the design system
exists to make those claims honest on screen. That is the constraint that
shapes everything below: this is not a generic component kit, and a
composition that looks good while overstating certainty is a defect, not a
style choice.

## The four rules that are never negotiable

**1. A reported number never appears without its evidence.** `ReportedValue`,
`ConfidenceBadge`, `EvidenceChip`, `CoverageBand` and `ProvenanceBlock` are one
family. A figure rendered bare - a hectare count in a heading, a percentage in
a card - is the failure mode this whole system exists to prevent. If you show a
value, show what it came from.

**2. Unknown is not zero.** The domain has a real `Unknown` shape
(`{kind: "unknown", evidence: "unknown", reason, coverageGrade}`) distinct from
a figure of `0`. Render an unknown as the missing-value en dash `–` or the
component's own "not published" treatment, never as `0`, never as a blank cell,
and never as an omitted row. The reason string travels with it and should be
reachable.

**3. Every component is bilingual.** Every component in this system takes
`locale: "en" | "fr"`. There is no default. French copy runs materially longer
than English, so any layout you design has to hold at French length - test it
there, not just in English.

**4. Colour never carries meaning alone.** Legends, statuses and evidence
classes are always paired with a label or shape. `--rule` is a decorative
hairline at 1.38:1 and is explicitly **never** a state cue; use `--rule-strong`
(3.28:1) for anything a user has to perceive as an edge.

## Colour

The palette is warm paper, moss and clay - not a neutral grey UI. Two layers,
and the distinction matters:

**Style tokens** are yours to compose with:

| Role | Tokens |
|---|---|
| Ground and surface | `--ground` (rice paper), `--surface`, `--surface-2` (stone), `--sand` (section tint) |
| Ink | `--ink` 13.70:1, `--ink-2` 8.95:1, `--muted` 6.25:1 |
| Rules and edges | `--rule` decorative only, `--rule-strong` control edges, `--rule-soft` |
| Brand | `--accent` moss for links and small text, `--accent-fill` moss as large fill only, `--accent-soft`, `--clay`, `--clay-ink` |
| Shape and depth | `--radius-sm` 12px, `--radius` 20px, `--radius-lg` 28px, `--shadow-soft`, `--shadow-float`, `--shadow-lift`, `--ease`, `--dur` |

**Semantic tokens carry meaning and must not be borrowed for decoration:**

- Event colours: `--harvest`, `--fire`, `--insect`, `--unknown`.
- Evidence tints and their edges: `--tint-record` / `--edge-record`,
  `--tint-satellite` / `--edge-satellite`, `--tint-derived` / `--edge-derived`,
  `--tint-unknown` / `--edge-unknown`. One tinted pill per evidence class.
- The observed-loss ramp `--loss-0` through `--loss-3` and the patch colours
  `--patch-harvest`, `--patch-fire`. These are held in `:root` only and are
  **never themed**, because a legend swatch has to read as the same colour as
  the map fill beside it.
- Province flag colours (`--flag-*`) keep their fixed identity in both themes.

Two contrast traps the palette documents explicitly:

- `--clay` is a fill and decoration colour and is **never** used as text. Use
  `--clay-ink` (6.55:1) when clay has to carry words.
- `--muted` is **never** used on the evidence tints - it lands at 4.52-4.62
  there, too close to the 4.5 floor once the paper grain composites.

Every component supports light and dark. The dark palette is a warm near-black,
with moss and clay lifted so they still clear AA.

## Typography

- UI face is **BC Sans** (`--ui: "BC Sans", "Noto Sans", Verdana, Arial, sans-serif`).
  It ships with the bundle. If a card renders in Times or Helvetica, the
  stylesheet did not load - that is a bug, not a fallback.
- `--mono` is for labels, identifiers, dataset versions and rule ids
  (`CONF-HIGH-001`), not for body copy.
- `--text-small` 0.875rem and `--text-compact` 0.75rem are the two steps below
  body.
- `--measure` is 68ch. Prose columns respect it. `--plate` 1180px is the page
  width; `--drawer` 420px is the side panel.

## Composition

- `SiteShell` is the page frame: it renders `SiteHeader`, the children you give
  it, and `SiteFooter`. It does **not** supply the `main` landmark - the route
  does. The real pages compose it as
  `<SiteShell locale="en"><main id="main" className="page-wrap">…</main></SiteShell>`,
  and the accessibility contract checks for exactly that `main#main`. Reproduce
  it; a `SiteShell` whose children have no `main` fails the check.
- Page bodies (`PlacePage`, `DataPage`, `MethodologyPage`, `GovernancePage`,
  `SearchPage`, `AccountStatusPage`) go inside that `main`.
- `SiteHeader`, `SiteFooter` and `ProvinceBar` are full-bleed chrome.
- `LocaleLink` and `LocaleAnchor` are **the language switch**, not general link
  primitives. `LocaleLink` is the client island that reads the current route and
  computes the href to the same page in the other language; `LocaleAnchor` is
  the shared rendering, taking an `href` directly, and is what the static
  fallback uses while `useSearchParams` suspends. Both render one link labelled
  "Français" or "English". For ordinary in-app navigation, write a normal
  anchor with the locale prefix the page already carries.
- The policy primitives compose bottom-up: an `EvidenceChip` and a
  `ConfidenceBadge` sit with a `ReportedValue`; a `ProvenanceBlock` closes the
  group with dataset, version, retrieval date and licence.

## Accessibility contracts these components already satisfy

Keep them satisfied when you compose:

- A `main#main` landmark on every locale route using `SiteShell`.
- SVGs are named; decorative ones are hidden.
- Explore legends are never colour-only.
- Tables carry a caption and scoped headers (`<th scope="row">`).
- Inputs are labelled; buttons declare an explicit `type`.
- `/en` routes render `<html lang="en">` and `/fr` routes `<html lang="fr">`.
  A `lang` attribute on an inner wrapper scopes pronunciation for that subtree
  only - it does not set the page voice.

## Writing copy

- Plain language, and the same register in both languages. This is a public
  service read by people who are not foresters.
- Never overstate. "Not published" is a real, correct answer and the system has
  a treatment for it. So is "no authoritative record for this location."
- Dataset names, versions, licence ids and rule ids are quoted verbatim from
  the record. Do not paraphrase them and do not invent them - a plausible-looking
  fake dataset name in a mockup is the single most damaging thing you can put in
  this UI.
