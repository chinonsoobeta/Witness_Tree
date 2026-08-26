# Accessibility contracts

The static contract check inspects route and component TSX for a small set of
blocking requirements: a `main#main` path for locale routes using `SiteShell`,
named SVGs, non-colour-only Explore legends, captions and scoped table headers,
labelled inputs, image alt text, and explicit button types.

Run it with `npm run check:accessibility`. It is a source-level guard only. It
is not an axe scan, manual accessibility review, external audit, or proof of
EN 301 549 conformance. Keyboard behavior, rendered contrast, assistive
technology behavior, and legal conformance require separate testing.

## Document language

Each locale owns its own root layout, so `/en` routes render `<html lang="en">`
and `/fr` routes render `<html lang="fr">`. The language gateway at `/` is
bilingual and declares English, with the French choice carrying its own `lang`.
A `lang` attribute on a wrapper element inside `<body>` scopes pronunciation for
that subtree only; assistive technology reads `<html lang>` for the page voice,
so the document language has to be right at the document level. The rendered
assertion lives in `tests/rendered-html.test.mjs`. This is a source and rendered
guard, not a screen reader test.
