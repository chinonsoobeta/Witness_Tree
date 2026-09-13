import type { ReactNode } from "react";
import { LocaleAnchor } from "witness-tree";

// The presentational half of the language switch, and the only part of it that
// renders on the server. SiteHeader mounts it twice: directly, as the Suspense
// fallback for LocaleLink — which is why the fallback href is bare "/fr", the
// other language's home — and again inside LocaleLink with the counterpart
// lib/locale-navigation.ts resolved for the current route. Both hrefs below are
// taken from that table, and the safe query parameters it carries across.

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>{children}</div>
);

export const FromEnglish = () => (
  <LocaleAnchor locale="en" href="/fr/explorer?mode=forest-change&year=2022" />
);

export const SuspenseFallback = () => <LocaleAnchor locale="en" href="/fr" />;

export const BothDirections = () => (
  <Row>
    <LocaleAnchor locale="en" href="/fr/donnees" />
    <LocaleAnchor locale="fr" href="/en/data" />
  </Row>
);

export const FromFrench = () => (
  <LocaleAnchor locale="fr" href="/en/places/qc-capitale-nationale?view=table" />
);
