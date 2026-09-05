import type { ReactNode } from "react";
import { LocaleLink } from "witness-tree";

// The client island SiteHeader wraps in Suspense. It takes only the locale of
// the page it sits on and reads the route itself through next/navigation, so
// the axis here is the language of the page rather than a prop sweep: on an
// English page the switch offers Français, on a French page it offers English.

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>{children}</div>
);

export const OnAnEnglishPage = () => <LocaleLink locale="en" />;

export const BothDirections = () => (
  <Row>
    <LocaleLink locale="en" />
    <LocaleLink locale="fr" />
  </Row>
);

export const OnAFrenchPage = () => <LocaleLink locale="fr" />;
