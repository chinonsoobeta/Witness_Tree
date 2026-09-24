---
category: site
---
The language switch as it is actually painted: an `<a>` carrying the other language's label, `hreflang`, and `lang`.

`LocaleLink` computes the href from the current route and then renders this. The split exists so the Suspense fallback and the resolved link cannot drift apart in wording or attributes, which is why this component takes a plain `href` rather than reading the route itself. Render it directly only when the destination is already known; otherwise use `LocaleLink`.

```tsx
<LocaleAnchor locale="en" href="/fr" />
```
