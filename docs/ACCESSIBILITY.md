# Accessibility contracts

The static contract check inspects route and component TSX for a small set of
blocking requirements: a `main#main` path for locale routes using `SiteShell`,
named SVGs, non-colour-only Explore legends, captions and scoped table headers,
labelled inputs, image alt text, and explicit button types.

Run it with `npm run check:accessibility`. It is a source-level guard only. It
is not an axe scan, manual accessibility review, external audit, or proof of
EN 301 549 conformance. Keyboard behavior, rendered contrast, assistive
technology behavior, and legal conformance require separate testing.
