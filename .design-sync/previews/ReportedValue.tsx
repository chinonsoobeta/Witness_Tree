import { ReportedValue } from "witness-tree";

// ReportedValue is the site's whole disclosure convention in one component: a
// figure never appears without its evidence class, its confidence, and the
// coverage grade of the place it came from. The unknown branch is not an error
// state, it is the honest answer, so it gets equal billing here.
const CONFIDENCE_HIGH = {
  level: "high",
  ruleId: "CONF-HIGH-001",
  reason: {
    en: "Direct authoritative record with clear geometry, date and attributes.",
    fr: "Registre faisant directement autorité, avec une géométrie, une date et des attributs clairs.",
  },
} as const;

const CONFIDENCE_LIMITED = {
  level: "limited",
  ruleId: "CONF-LIMITED-001",
  reason: {
    en: "Useful indication only because a documented coverage or resolution limit affects this location.",
    fr: "Indication utile seulement, car une limite documentée de couverture ou de résolution touche cet emplacement.",
  },
} as const;

const BC_FTEN = {
  dataset: "BC FTEN Harvest Authority",
  version: "2026-01-30",
  retrievedDate: "2026-01-31",
  licence: "ogl-bc-2.0",
  recordUrl: "https://catalogue.data.gov.bc.ca/dataset/harvesting-authority",
} as const;

const NTEMS = {
  dataset: "NTEMS Forest Change 1984-2022",
  version: "2024-08",
  retrievedDate: "2026-02-14",
  licence: "ogl-canada-2.0",
} as const;

const OFFICIAL_FIGURE = {
  kind: "figure",
  value: 1284.6,
  unit: "ha",
  evidence: "official-record",
  confidence: CONFIDENCE_HIGH,
  provenance: BC_FTEN,
} as const;

const SATELLITE_FIGURE = {
  kind: "figure",
  value: 22.4,
  unit: "%",
  evidence: "satellite-observation",
  confidence: CONFIDENCE_LIMITED,
  provenance: NTEMS,
} as const;

const NOT_KNOWN = {
  kind: "unknown",
  evidence: "unknown",
  reason: {
    en: "No harvest authority record covers this boundary for the selected years.",
    fr: "Aucun registre d’autorisation de récolte ne couvre cette limite pour les années choisies.",
  },
  coverageGrade: "extended-record-sparse-official-matching",
} as const;

export const OfficialRecord = () => (
  <ReportedValue reported={OFFICIAL_FIGURE} coverageGrade="enhanced-local-records" locale="en" />
);

export const SatelliteObservation = () => (
  <ReportedValue reported={SATELLITE_FIGURE} coverageGrade="national-baseline" locale="en" />
);

export const NotKnown = () => (
  <ReportedValue
    reported={NOT_KNOWN}
    coverageGrade="extended-record-sparse-official-matching"
    locale="en"
  />
);

export const French = () => (
  <ReportedValue reported={OFFICIAL_FIGURE} coverageGrade="enhanced-local-records" locale="fr" />
);
