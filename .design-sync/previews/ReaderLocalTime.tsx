import { ReaderLocalTime } from "witness-tree";

// Real instants from the repo's own fixtures: the illustrative wildfire feed
// (ILLUSTRATIVE_WILDFIRE_FEED, lib/wildfire/fixtures.ts) publishes
// sourceUpdatedAt and lastSuccessfulRefreshAt, and the Quebec historic wildfire
// archive records retrievedAt (EXAMPLE_RECORDED_STAGING,
// lib/archive-staging/admission-fixtures.ts). The component re-renders each of
// them in the reader's own zone, which is the whole point: a UTC instant in a
// feed-status panel is not something a reader can act on.
const SOURCE_UPDATED_AT = "2026-08-11T18:30:00Z";
const LAST_SUCCESSFUL_REFRESH_AT = "2026-08-11T19:00:00Z";
const ARCHIVE_RETRIEVED_AT = "2026-08-12T05:22:16Z";

// Labels are the product's, not invented: the first two are the feed-status
// terms in components/wildfire/WildfireView.tsx (and lib/wildfire/view-model.ts
// wildfireText), the third is ProvenanceBlock's retrieved label.
const LABELS = {
  en: {
    sourceUpdated: "Source updated",
    lastRefresh: "Last successful Witness Tree refresh",
    retrieved: "Retrieved",
  },
  fr: {
    sourceUpdated: "Mise à jour de la source",
    lastRefresh: "Dernière actualisation réussie d’Arbre témoin",
    retrieved: "Récupéré",
  },
} as const;

// The component is a bare <time>; in the product it always lands in a feed
// status stat, so the cells keep it there rather than floating it on white.
const Stat = ({ label, dateTime, locale }: { label: string; dateTime: string; locale: "en" | "fr" }) => (
  <div className="stat">
    <dt>{label}</dt>
    <dd><ReaderLocalTime dateTime={dateTime} locale={locale} /></dd>
  </div>
);

export const SourceUpdated = () => (
  <dl className="stat-row" style={{ margin: 0, maxWidth: "22rem" }}>
    <Stat label={LABELS.en.sourceUpdated} dateTime={SOURCE_UPDATED_AT} locale="en" />
  </dl>
);

export const FeedTimestamps = () => (
  <dl className="stat-row" style={{ margin: 0, maxWidth: "52rem" }}>
    <Stat label={LABELS.en.sourceUpdated} dateTime={SOURCE_UPDATED_AT} locale="en" />
    <Stat label={LABELS.en.lastRefresh} dateTime={LAST_SUCCESSFUL_REFRESH_AT} locale="en" />
    <Stat label={LABELS.en.retrieved} dateTime={ARCHIVE_RETRIEVED_AT} locale="en" />
  </dl>
);

export const FeedTimestampsFrench = () => (
  <dl className="stat-row" style={{ margin: 0, maxWidth: "52rem" }}>
    <Stat label={LABELS.fr.sourceUpdated} dateTime={SOURCE_UPDATED_AT} locale="fr" />
    <Stat label={LABELS.fr.lastRefresh} dateTime={LAST_SUCCESSFUL_REFRESH_AT} locale="fr" />
    <Stat label={LABELS.fr.retrieved} dateTime={ARCHIVE_RETRIEVED_AT} locale="fr" />
  </dl>
);
