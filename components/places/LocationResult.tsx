import { colon, type Locale } from "@/lib/domain";
import type { Location, Place } from "@/lib/places";
import {
  ConfidenceBadge,
  EvidenceChip,
  ProvenanceBlock,
} from "@/components/policy";

export function LocationResult({
  locale,
  location,
  places,
}: Readonly<{ locale: Locale; location: Location; places: readonly Place[] }>) {
  const text =
    locale === "en"
      ? {
          coordinates: "Coordinates and accuracy",
          contains: "Containing geographies",
          events: "Events",
          limitation: "Limitation",
          provenance: "Provenance",
        }
      : {
          coordinates: "Coordonnées et précision",
          contains: "Géographies contenantes",
          events: "Événements",
          limitation: "Limite",
          provenance: "Provenance",
        };
  return (
    <main id="main" className="page-wrap record-page">
      <header className="masthead">
        <p className="eyebrow">
          {locale === "en" ? "Illustrative fixture" : "Exemple illustratif"}
        </p>
        <h1>{location.summary[locale]}</h1>
      </header>

      <section className="record-block">
        <h2>{text.coordinates}</h2>
        <p className="coordinates">
          {location.latitude}, {location.longitude}; ±{location.accuracyMetres}{" "}
          m
        </p>
      </section>

      <section className="record-block">
        <h2>{text.contains}</h2>
        <ul className="source-list">
          {places.map((place) => (
            <li className="card card--lift" key={place.id}>
              <a
                href={
                  locale === "en"
                    ? `/en/places/${place.id}`
                    : `/fr/lieux/${place.id}`
                }
              >
                {place.name[locale]}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="record-block">
        <h2>{text.events}</h2>
        <div className="event-stack">
          {location.events.map((event) => (
            <article className="card event-card" key={event.id}>
              <h3>
                {event.year}: {event.title[locale]}
              </h3>
              <p className="cluster">
                <EvidenceChip evidence={event.evidence} locale={locale} />
                <ConfidenceBadge
                  confidence={event.confidence}
                  locale={locale}
                />
              </p>
              <p>
                <strong>
                  {text.limitation}
                  {colon(locale)}
                </strong>{" "}
                {event.limitation[locale]}
              </p>
              <h4>{text.provenance}</h4>
              <ProvenanceBlock provenance={event.provenance} locale={locale} />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
