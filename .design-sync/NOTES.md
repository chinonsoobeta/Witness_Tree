# design-sync notes — Witness Tree

Durable, hand-maintained. Read this before any re-sync; it records everything the
config alone does not explain.

## Repo shape

- **Shape is `package`, not `storybook`.** There is no Storybook and no
  `*.stories.*` anywhere. Previews are hand-authored under
  `.design-sync/previews/` and graded on the absolute rubric.
- **The package has no entry point.** `package.json` declares no `main`,
  `module`, `exports` or `types`, so the converter runs in **synth-entry mode**:
  it builds `.pkg-entry.mjs` by walking `cfg.srcDir` (`components/`). Everything
  below follows from that mode.
- 37 components across 11 groups. Nine carry `"use client"`
  (ExploreMapClient, ExploreView, ExploreYearControl, ShapeDrawMap,
  ShapeMeasureClient, AddressFinderClient, LocaleLink, ThemeToggle,
  ReaderLocalTime); the directive is inert in the bundle.
- The repo is an unusually clean converter target: no async server components,
  no database imports inside `components/`, and every component takes its data
  as props. Nothing needed a provider wrapper.

## Local setup a fresh clone must redo

1. **`node_modules/witness-tree` must be a symlink to the repo root**:
   ```
   ln -sfn ../ node_modules/witness-tree
   ```
   The converter resolves `PKG_DIR = <node_modules>/<cfg.pkg>` and npm never
   self-installs a private package, so without this the build dies with
   `ENOENT .../node_modules/witness-tree/package.json`. It is gitignored by
   design — recreate it, never commit it.
2. **`.design-sync/.cache/` is generated** and gitignored. `cfg.buildCmd` writes
   `compile-css.mjs`'s output there; the build runs the command itself, so no
   manual step is needed as long as `.design-sync/.cache/compile-css.mjs` exists.
   If the cache directory has been wiped, re-create that script (postcss +
   `@tailwindcss/postcss` over `app/globals.css`).

## Why each non-obvious config field exists

- **`buildCmd` + `cssEntry`** — `app/globals.css` starts with
  `@import "tailwindcss"`, which esbuild cannot resolve. The build command
  compiles Tailwind ahead of time and `cssEntry` points at the compiled result.
  Do not point `cssEntry` at `app/globals.css` directly; it will fail with
  `Could not resolve "tailwindcss"`.
- **`tsconfig` → `.design-sync/tsconfig.dssync.json`** — holds three fixes:
  1. `@/app/globals.css` → the compiled CSS above.
  2. `@bcgov/bc-sans/css/BC_Sans.css` → `.design-sync/shims/empty.css`. Without
     it, `Document.tsx`'s font import inlines twelve font faces as data URIs and
     `_ds_bundle.css` balloons from 212 KB to **4946 KB**. The fonts still ship
     as real files through `cfg.extraFonts`.
  3. **43 exact, non-wildcard barrel entries** (`"@/lib/domain":
     ["../lib/domain/index.ts"]`, and so on for every directory under `lib/` and
     `components/` that has an `index.ts`).
- **`.design-sync/shims/navigation.ts`** — the repo's `next/navigation` comes
  from vinext and pulls in `node:async_hooks`, which cannot bundle for a
  browser. The shim reimplements `usePathname` / `useSearchParams` / `useParams`
  / `useRouter` against `window.location`. It deliberately **deletes the `story`
  query parameter** so a preview card's own story selector never leaks into the
  hrefs the component renders.
- **`docsMap.LocaleAnchor`** — a doc stub whose `category: site` frontmatter
  moves LocaleAnchor out of the `general` group. See the trap below for why this
  is not done with `componentSrcMap`.
- **`dtsPropsFor` (all 37)** — see "Prop contracts" below.

## Traps

- **`componentSrcMap` with a non-null value destroys discovery.** In
  `lib/source-kit.mjs`, `deriveComponentsFromSrc` only runs
  `if (!components.length && synthEntry)`. Any non-null `componentSrcMap` entry
  seeds `components`, the derivation is skipped, and the component count
  collapses from 37 to 1. Only `null` entries (exclusions, like `"Document"`)
  are safe in this repo. Use `docsMap` for regrouping instead.
- **The converter's tsconfig-paths plugin is not esbuild's.**
  `lib/bundle.mjs` implements its own, and it strips only a **trailing** `*`
  from a target. A mapping like `"@/*": ["../*/index.ts"]` therefore produces
  literal nonexistent paths, not a wildcard — that is why the barrel entries are
  written out exactly. The same plugin's extension list starts with `''`, so a
  bare directory path wins over `<dir>/index.ts`; without the barrel pins the
  build fails with eight `Cannot read file ...: is a directory` errors.
- **Prop contracts had to be supplied by hand.** `findTypesRoot` picks the first
  of `build/ts`, `dist/types`, `types`, `lib`, `dist` that exists, with no
  `.d.ts` check — so it picks this repo's `lib/` (a source directory), and
  `projectFor`'s entry `<repo>/index.d.ts` does not exist. Zero declaration
  files get parsed and every contract emits as
  `export interface XProps { [key: string]: unknown }`. Fixed by populating
  `cfg.dtsPropsFor` for all 37 components. **`dtsPropsFor` bodies have no
  prelude slot**, so they must be self-contained: inline structural types and
  literal unions only, no named domain types. React types are fine as
  `React.ReactNode` etc. because the emitted `.d.ts` imports `* as React`.
  Regenerate them with the TypeScript checker rather than by hand if the domain
  types move.

- **`buildCmd` is documentation, not automation.** `package-build.mjs` reads the
  key but never executes it (`grep -n buildCmd .ds-sync/*.mjs .ds-sync/lib/*.mjs`
  finds it only in `common.mjs`'s list of known keys). Nothing warns you. Edit
  `app/globals.css`, rebuild, and the bundle silently keeps the previously
  compiled CSS, so the change never reaches a preview and the screenshot lies
  about the fix. **Run `node .design-sync/.cache/compile-css.mjs` yourself before
  every `package-build.mjs` run that follows a CSS edit.** Confirm it landed with
  `grep -c '<your-new-class>' ds-bundle/_ds_bundle.css`.
- **A full `package-build.mjs` run wipes `ds-bundle/_screenshots/`.** Grades in
  `.design-sync/.cache/review/*.grade.json` survive, but every sheet not yet
  graded is gone. After any full rebuild, re-run `package-capture.mjs --components`
  scoped to everything still ungraded, or you will be asked to grade sheets that
  no longer exist.
- **Components that render `position: fixed` chrome escape their preview cell.**
  `SiteHeader` and `SiteShell` carry the app's `.skip-link`, parked off-screen at
  `translateY(-160%)`; in a preview it resolves against the card viewport, not the
  component, and paints a clipped dark shape at the top of every cell. Wrap the
  preview in a container that becomes the containing block for fixed descendants:
  `position: relative; transform: translateZ(0); overflow: hidden`.

## Preview conventions

- Import from the package name: `import { X } from "witness-tree"`.
- Fixtures use the product's **real** copy: confidence reason strings from
  `lib/domain/confidence.ts`, real dataset names ("NTEMS Forest Change
  1984-2022", "BC FTEN Harvest Authority"), real licence ids
  (`ogl-canada-2.0`, `ogl-bc-2.0`). This app's whole subject is provenance, so
  an invented dataset name in a card would misrepresent the component.
- Every component takes `locale: "en" | "fr"`. Give each component a **French
  cell** — the app is bilingual and the French strings are materially longer, so
  the French card is where layout problems surface.
- Layout helpers inside a preview use inline styles. Never invent a class name;
  the bundle only carries the app's own semantic classes.
- 3 to 4 exports per component: one canonical English cell, one sweep of the
  primary variant axis, one French cell.

## Known render warns

- 12 components currently show the **typographic floor card** — they are
  unauthored, not broken. This list shrinks to zero as authoring proceeds.
  Wave 1 authored and graded 25 of 37; the remaining 12 are the `comparison`,
  `explore` and `places` groups.

## Re-sync risks

- If `app/globals.css`, the Tailwind version, or the BC Sans package moves, the
  `buildCmd` compile step is the first thing to check.
- If a new directory barrel appears under `lib/` or `components/`, add its exact
  entry to `tsconfig.dssync.json`; the wildcard will not cover it.
- If the domain types in `lib/domain/` change shape, `dtsPropsFor` goes stale
  silently — the build will not complain. Regenerate it.
- If the repo ever gains a real `dist/` with declaration files, most of
  `dtsPropsFor` can be deleted in favour of real extraction.

## Product defects this sync surfaced

Rendering every component in isolation, at several widths and in both locales,
found real bugs that the app's own test suite and static gates did not. These
were fixed in product source, not worked around in the previews.

- **`SourceCurrency` shipped an unstyled table.** All table cell padding in this
  app lives under `.table-scroll`, and this was the one table never wrapped in it,
  so its header labels collided on the live `/data` page. Wrapping it exposed a
  second problem: with `table-layout: auto` the long archive name claimed the whole
  prose measure and pushed both year columns out of view. Fixed with a
  `.currency-table` class that pins the layout and restores numeric alignment on
  the last column, which the shared rule left-aligns because it assumes a label
  sits there.
- **`AnnualChangeChart` had a keyboard-unreachable scroll region.** Every other
  `.table-scroll` in the app carries `tabIndex={0} role="region" aria-label`; this
  one carried none, so its horizontally scrolling table could not be scrolled from
  the keyboard. `check:accessibility` did not catch it.

Both are the class of bug only a rendered browser finds. Expect more of them as
waves 2 and beyond author the `explore` and `comparison` previews, which carry the
app's densest tables and its only map surfaces.

## Capture harness limits worth knowing before tuning viewports

- **`viewport` is clamped to 2000x2000** (`package-capture.mjs`, the `Math.min(+vpMatch[n], 2000)` pair). A page-scale component taller than that cannot be captured whole by making the cell taller. The fix that works is going *wider*: less text wrapping shortens the page. `ExploreView` needed `1600x2000` and still stops one table row short, which is the ceiling and not a defect in the component.
- **`package-capture.mjs` clears `_screenshots/review/` for every run, not just for the components named.** Capturing one component deletes the other sheets. Grades survive because they live in `.design-sync/.cache/review/`, so the working order is: read the sheets, write the grades, then capture the next set. Grading from a sheet a later capture has already deleted is the mistake this prevents.
- Changing a `viewport` override is a keyed change: `preview-rebuild.mjs` refuses with `CONFIG_STALE` and a full `package-build.mjs` is required. `cardMode` is not keyed.

## Product defects this sync surfaced (continued)

4. **`ShapeDrawMap`'s two action buttons carried no class at all.** Its own analogue two files away, `ShapeMeasureClient`, styles the identical add/remove-corner actions `btn btn--ghost`, so "Remove the last corner" and "Start over" were rendering as bare browser buttons on the live Explore page. Fixed by giving them the same class. Same class of bug as the other three: invisible to typecheck, to the test suite, and to every static gate, and obvious the moment a browser draws it.
