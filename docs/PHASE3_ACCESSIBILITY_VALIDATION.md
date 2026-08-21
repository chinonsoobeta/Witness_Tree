# Phase 3 deterministic accessibility validation

This validation remains **example**, **unapproved**, **nonproduction**, and independent of real data or deployment.

The automated gate checks both declared palettes for WCAG relative-luminance contrast of normal text tokens against the page ground and surface. It applies fixed protan, deutan, and tritan simulation matrices to the four semantic colours and rejects pairs below its 12-point sRGB-distance proxy threshold. These calculations are deterministic engineering proxies, not a diagnosis or a claim that every person can distinguish the palette.

Colour is never the only semantic cue: evidence classes have four different shapes plus localized text; confidence has localized text plus bar patterns; Unknown has an em dash plus its localized reason; charts retain titles and accessible tables. Source gates also require visible keyboard focus, a focusable skip link, native source order, labelled controls, table captions/scopes, and forbid positive `tabIndex` and `autoFocus`.

Static rendering tests exercise every generated place and location in English and French. Every rendered `Figure` and `Unknown` must retain its locale marker, localized evidence and coverage, all four provenance fields, and—when Unknown—its localized reason. Built-route tests verify one main landmark, skip-link target, and header/main/footer source order without browser JavaScript.

Still open and fail-closed: real browser focus traversal and visual focus inspection, screen-reader testing, zoom/reflow, forced-colours behaviour, human CVD/greyscale review, and browser-measured performance/LCP. None is inferred from source or static HTML.
