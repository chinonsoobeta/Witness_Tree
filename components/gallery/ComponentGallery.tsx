import type { ConfidenceResult, EvidenceClass, Locale, Provenance, Reported } from "@/lib/domain";
import { ConfidenceBadge, CoverageBand, EvidenceChip, ReportedValue } from "@/components/policy";

type GalleryCopy = Readonly<{
  title: string;
  intro: string;
  light: string;
  dark: string;
  evidence: string;
  confidence: string;
  coverage: string;
  values: string;
  figure: string;
  unknown: string;
}>;

const COPY: Record<Locale, GalleryCopy> = {
  en: {
    title: "Component gallery",
    intro: "Every figure on this site shows its evidence, confidence, coverage and source.",
    light: "Light theme",
    dark: "Dark theme",
    evidence: "Evidence classes",
    confidence: "Confidence",
    coverage: "Coverage",
    values: "Example values (made up, not records)",
    figure: "Figure",
    unknown: "Unknown",
  },
  fr: {
    title: "Galerie de composants",
    intro: "Chaque chiffre du site affiche sa preuve, sa confiance, sa couverture et sa source.",
    light: "Thème clair",
    dark: "Thème sombre",
    evidence: "Catégories de preuves",
    confidence: "Confiance",
    coverage: "Couverture",
    values: "Valeurs d’exemple (inventées, pas des registres)",
    figure: "Valeur chiffrée",
    unknown: "Inconnu",
  },
};

const EVIDENCE: EvidenceClass[] = ["official-record", "satellite-observation", "derived-estimate", "unknown"];
const CONFIDENCE: ConfidenceResult[] = [
  { level: "high", ruleId: "CONF-HIGH-001", reason: { en: "Direct authoritative record with clear geometry, date and attributes.", fr: "Registre faisant directement autorité, avec une géométrie, une date et des attributs clairs." } },
  { level: "medium", ruleId: "CONF-MEDIUM-001", reason: { en: "Good evidence, with one important gap: the attribution is partial.", fr: "Bonne preuve, avec une lacune importante : l’attribution est partielle." } },
  { level: "limited", ruleId: "CONF-LIMITED-001", reason: { en: "The forest inventory is 6 years older than the event, and its details were not updated for tree growth.", fr: "L’inventaire forestier a 6 ans de plus que l’événement, et ses détails n’ont pas été mis à jour selon la croissance des arbres." } },
];

const COVERAGE = ["national-baseline", "extended-record-sparse-official-matching", "national-baseline-plus-local-context"] as const;

export type ComponentGalleryProps = Readonly<{ locale: Locale }>;

export function ComponentGallery({ locale }: ComponentGalleryProps) {
  const copy = COPY[locale];
  const provenance: Provenance = {
    // A made-up source for a made-up value, named as such so it cannot be read as a real record.
    dataset: locale === "en" ? "Example record" : "Registre d’exemple",
    version: "2026.1",
    retrievedDate: "2026-08-11",
    licence: "ogl-canada-2.0",
  };
  const figure: Reported = {
    kind: "figure",
    value: 12.5,
    unit: "ha",
    evidence: "official-record",
    confidence: CONFIDENCE[0],
    provenance,
  };
  const unknown: Reported = {
    kind: "unknown",
    evidence: "unknown",
    reason: {
      en: "No official public record answers this question yet.",
      fr: "Aucun registre public officiel ne répond encore à cette question.",
    },
    coverageGrade: "national-baseline-plus-local-context",
  };

  return (
    <main id="main" className="page-wrap component-gallery">
      <header className="masthead">
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
      </header>
      <div className="gallery-grid">
        <ThemePanel title={copy.light} theme="light">
          <GalleryContent copy={copy} locale={locale} figure={figure} unknown={unknown} />
        </ThemePanel>
        <ThemePanel title={copy.dark} theme="dark">
          <GalleryContent copy={copy} locale={locale} figure={figure} unknown={unknown} />
        </ThemePanel>
      </div>
    </main>
  );
}

function ThemePanel({ children, theme, title }: Readonly<{ children: React.ReactNode; theme: "light" | "dark"; title: string }>) {
  return (
    <section aria-label={title} data-theme={theme} className={`gallery-panel gallery-panel-${theme}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function GalleryContent({ copy, figure, locale, unknown }: Readonly<{ copy: GalleryCopy; figure: Reported; locale: Locale; unknown: Reported }>) {
  return (
    <div>
      <section>
        <h3>{copy.evidence}</h3>
        <ul>{EVIDENCE.map((evidence) => <li key={evidence}><EvidenceChip evidence={evidence} locale={locale} /></li>)}</ul>
      </section>
      <section>
        <h3>{copy.confidence}</h3>
        <ul>{CONFIDENCE.map((confidence) => <li key={confidence.ruleId}><ConfidenceBadge confidence={confidence} locale={locale} /></li>)}</ul>
      </section>
      <section>
        <h3>{copy.coverage}</h3>
        <ul>{COVERAGE.map((coverageGrade) => <li key={coverageGrade}><CoverageBand coverageGrade={coverageGrade} locale={locale} /></li>)}</ul>
      </section>
      <section>
        <h3>{copy.values}</h3>
        <article><h4>{copy.figure}</h4><ReportedValue reported={figure} coverageGrade="national-baseline" locale={locale} /></article>
        <article><h4>{copy.unknown}</h4><ReportedValue reported={unknown} coverageGrade="national-baseline-plus-local-context" locale={locale} /></article>
      </section>
    </div>
  );
}
