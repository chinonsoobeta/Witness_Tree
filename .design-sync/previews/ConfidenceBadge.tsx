import type { ReactNode } from "react";
import { ConfidenceBadge } from "witness-tree";

// The four results assignConfidence can return, with the reason strings the
// rules actually emit. The badge shows the level; the reason is its title and
// accessible name, so a fixture with invented copy would misrepresent both.
const HIGH = {
  level: "high",
  ruleId: "CONF-HIGH-001",
  reason: {
    en: "Direct authoritative record with clear geometry, date and attributes.",
    fr: "Registre faisant directement autorité, avec une géométrie, une date et des attributs clairs.",
  },
} as const;

const MEDIUM = {
  level: "medium",
  ruleId: "CONF-MEDIUM-001",
  reason: {
    en: "Strong evidence with a material limitation: the event date is uncertain by 3 years.",
    fr: "Preuve solide comportant une limite importante : la date de l’événement est incertaine à 3 ans près.",
  },
} as const;

const LIMITED = {
  level: "limited",
  ruleId: "CONF-LIMITED-001",
  reason: {
    en: "Inventory vintage predates the event by 9 years. Attributes were carried forward without growth modelling.",
    fr: "Le millésime de l’inventaire précède l’événement de 9 ans. Les attributs ont été reportés sans modélisation de la croissance.",
  },
} as const;

const UNKNOWN = {
  level: "unknown",
  ruleId: "CONF-UNKNOWN-001",
  reason: {
    en: "No authoritative record and no resolved geometry for this location.",
    fr: "Aucun registre faisant autorité ni géométrie résolue pour cet emplacement.",
  },
} as const;

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>{children}</div>
);

export const High = () => <ConfidenceBadge confidence={HIGH} locale="en" />;

export const AllLevels = () => (
  <Row>
    <ConfidenceBadge confidence={HIGH} locale="en" />
    <ConfidenceBadge confidence={MEDIUM} locale="en" />
    <ConfidenceBadge confidence={LIMITED} locale="en" />
    <ConfidenceBadge confidence={UNKNOWN} locale="en" />
  </Row>
);

export const French = () => (
  <Row>
    <ConfidenceBadge confidence={HIGH} locale="fr" />
    <ConfidenceBadge confidence={MEDIUM} locale="fr" />
    <ConfidenceBadge confidence={LIMITED} locale="fr" />
    <ConfidenceBadge confidence={UNKNOWN} locale="fr" />
  </Row>
);
