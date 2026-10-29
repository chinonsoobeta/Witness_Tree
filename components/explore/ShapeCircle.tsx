"use client";

/**
 * The two parts of the circle that are not geometry: finding its centre from
 * an address or place, and naming the districts that centre sits in.
 *
 * The address goes to the address route as a POST body, exactly as the address
 * finder on the search page sends it, and only the point that comes back is
 * kept. The district route is given that point, never the text.
 */

import { useState, type RefObject } from "react";
import type { Locale } from "@/lib/domain";
import { ADDRESS_QUERY_MAX_LENGTH } from "@/lib/address";

type Point = Readonly<{ id: string; label: string; latitude: number; longitude: number }>;
type Named = Readonly<{ districtId: string; name: Record<Locale, string> }>;
export type DistrictLookup =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "single"; districtId: string; name: Record<Locale, string> }>
  | Readonly<{ kind: "mixture"; candidates: readonly Named[] }>;
export type ResolvedDistricts = Readonly<{
  federal: DistrictLookup;
  provincial: readonly Readonly<{ layerId: string; lookup: DistrictLookup }>[];
  precision: Readonly<{ blockMetres: number }>;
}>;
export type DistrictState =
  | Readonly<{ status: "loading" | "unavailable" | "failed" | "outside" }>
  | Readonly<{ status: "ready"; resolved: ResolvedDistricts }>;

const copy = {
  en: {
    finderLabel: "Address or place",
    find: "Find",
    finding: "Searching",
    finderNote:
      "Your search is sent to Google Places, the address service this site uses, to find the point. This site does not keep it.",
    choose: "Choose the matching place",
    none: "No place matched that search.",
    finderFailed: "The place could not be looked up just now.",
    heading: "Where the centre is",
    federal: "Federal riding",
    provincial: "Provincial riding",
    region: "Economic region",
    compare: "Compare this riding",
    explore: "See it on the Explore map",
    findOnMap: "Find it on the Explore map",
    loading: "Reading the riding index.",
    unavailable: "– The riding index is not available on this site yet, so the districts around this point are not named.",
    failed: "– The riding index could not be read just now.",
    outside: "– This point is outside the area the riding index covers.",
    noFederal: "– The riding index has no federal riding for this point.",
    noProvincial:
      "– The riding index has no provincial riding for this point. Provincial ridings are indexed for British Columbia, Alberta, Ontario and Québec.",
    noRegion:
      "– The riding index this site reads does not include economic regions yet, so the region containing this point is not named here.",
    near: (metres: number, names: string) =>
      `The centre is within ${metres} m of a boundary, so it may be in any of: ${names}.`,
    precision: (metres: number) =>
      `The centre is located on a ${metres} m grid. The measurement above covers the whole circle, which can reach into other districts.`,
    provinces: {
      "bc-2023": "British Columbia",
      "ab-2019": "Alberta",
      "on-2022": "Ontario",
      "qc-2026": "Québec",
    } as Record<string, string>,
  },
  fr: {
    finderLabel: "Adresse ou lieu",
    find: "Trouver",
    finding: "Recherche en cours",
    finderNote:
      "Votre recherche est transmise à Google Places, le service d’adresses utilisé par ce site, pour trouver le point. Ce site ne la conserve pas.",
    choose: "Choisissez le lieu correspondant",
    none: "Aucun lieu ne correspond à cette recherche.",
    finderFailed: "Le lieu n’a pas pu être trouvé pour le moment.",
    heading: "Où se trouve le centre",
    federal: "Circonscription fédérale",
    provincial: "Circonscription provinciale",
    region: "Région économique",
    compare: "Comparer cette circonscription",
    explore: "Voir sur la carte Explorer",
    findOnMap: "La trouver sur la carte Explorer",
    loading: "Lecture de l’index des circonscriptions.",
    unavailable:
      "– L’index des circonscriptions n’est pas encore offert sur ce site\u202F; les divisions autour de ce point ne sont donc pas nommées.",
    failed: "– L’index des circonscriptions n’a pas pu être lu pour le moment.",
    outside: "– Ce point est à l’extérieur du territoire couvert par l’index des circonscriptions.",
    noFederal: "– L’index ne contient aucune circonscription fédérale pour ce point.",
    noProvincial:
      "– L’index ne contient aucune circonscription provinciale pour ce point. Les circonscriptions provinciales sont indexées pour la Colombie-Britannique, l’Alberta, l’Ontario et le Québec.",
    noRegion:
      "– L’index des circonscriptions utilisé par ce site ne comprend pas encore les régions économiques\u202F; la région où se trouve ce point n’est donc pas nommée ici.",
    near: (metres: number, names: string) =>
      `Le centre est à moins de ${metres} m d’une limite\u202F; il peut donc se trouver dans l’une ou l’autre des divisions suivantes\u202F: ${names}.`,
    precision: (metres: number) =>
      `Le centre est localisé sur une grille de ${metres} m. La mesure ci-dessus porte sur le cercle entier, qui peut s’étendre sur d’autres divisions.`,
    provinces: {
      "bc-2023": "Colombie-Britannique",
      "ab-2019": "Alberta",
      "on-2022": "Ontario",
      "qc-2026": "Québec",
    } as Record<string, string>,
  },
} as const;

function exploreOverlayHref(locale: Locale, overlay: "federal-ridings" | "provincial-ridings" | "economic-regions") {
  return `${locale === "en" ? "/en/explore" : "/fr/explorer"}?overlays=${overlay}`;
}

function compareHref(locale: Locale, federalId: string) {
  return `${locale === "en" ? "/en/compare" : "/fr/comparer"}?left=${encodeURIComponent(federalId)}`;
}

/**
 * The address field for the circle's centre. Its controls belong to their own
 * form through the `form` attribute, so pressing Enter in it searches rather
 * than measuring, without nesting one form inside another.
 */
export function CircleCentreFinder({
  locale,
  formId,
  inputId,
  inputRef,
  onPoint,
}: Readonly<{
  locale: Locale;
  formId: string;
  inputId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onPoint: (point: Readonly<{ latitude: number; longitude: number }>, label: string) => void;
}>) {
  const text = copy[locale];
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState<readonly Point[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    setPoints(null);
    try {
      const response = await fetch("/api/address/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, locale }),
      });
      if (!response.ok) throw new Error("lookup");
      const body = (await response.json()) as { results?: readonly Point[] };
      setPoints(Array.isArray(body.results) ? body.results : []);
    } catch {
      setProblem(text.finderFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shape-finder">
      <form id={formId} onSubmit={search} />
      <div className="shape-field">
        <label htmlFor={inputId}>{text.finderLabel}</label>
        <div className="shape-finder-row">
          <input
            id={inputId}
            ref={inputRef}
            form={formId}
            type="text"
            autoComplete="street-address"
            maxLength={ADDRESS_QUERY_MAX_LENGTH}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" form={formId} className="btn btn--ghost" disabled={busy || !query.trim()}>
            {busy ? text.finding : text.find}
          </button>
        </div>
      </div>
      <p className="shape-note">{text.finderNote}</p>
      <div aria-live="polite">
        {problem ? <p className="shape-problem">{problem}</p> : null}
        {points && points.length === 0 && !problem ? <p className="shape-note">{text.none}</p> : null}
        {points && points.length > 0 ? (
          <>
            <p className="shape-note">{text.choose}</p>
            <ul className="shape-finder-results">
              {points.map((point) => (
                <li key={point.id}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      onPoint({ latitude: point.latitude, longitude: point.longitude }, point.label);
                      setPoints(null);
                    }}
                  >
                    {point.label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function namesOf(locale: Locale, lookup: Extract<DistrictLookup, { kind: "mixture" }>) {
  return lookup.candidates.map((candidate) => candidate.name[locale]).join(", ");
}

/**
 * The federal riding, provincial riding and economic region at the circle's
 * centre. A point near a boundary names every candidate rather than choosing
 * one, and anything the index cannot answer is said, never left blank.
 */
export function CircleDistricts({
  locale,
  state,
  comparableFederalIds,
}: Readonly<{ locale: Locale; state: DistrictState; comparableFederalIds: readonly string[] }>) {
  const text = copy[locale];
  const body = (() => {
    if (state.status === "loading") return <p className="shape-note">{text.loading}</p>;
    if (state.status !== "ready") return <p>{text[state.status]}</p>;
    const { federal, provincial, precision } = state.resolved;
    const federalId = federal.kind === "single" ? `federal-${federal.districtId}` : null;
    return (
      <>
        <dl className="shape-districts">
          <dt>{text.federal}</dt>
          <dd>
            {federal.kind === "empty" ? text.noFederal : null}
            {federal.kind === "single" ? (
              <>
                {federal.name[locale]}{" "}
                {federalId && comparableFederalIds.includes(federalId) ? (
                  <a href={compareHref(locale, federalId)}>{text.compare}</a>
                ) : (
                  <a href={exploreOverlayHref(locale, "federal-ridings")}>{text.explore}</a>
                )}
              </>
            ) : null}
            {federal.kind === "mixture" ? (
              <>
                {text.near(precision.blockMetres, namesOf(locale, federal))}{" "}
                <a href={exploreOverlayHref(locale, "federal-ridings")}>{text.explore}</a>
              </>
            ) : null}
          </dd>

          <dt>{text.provincial}</dt>
          {provincial.length === 0 ? <dd>{text.noProvincial}</dd> : null}
          {provincial.map((entry) => (
            <dd key={entry.layerId}>
              {entry.lookup.kind === "single" ? `${entry.lookup.name[locale]} (${text.provinces[entry.layerId] ?? entry.layerId})` : null}
              {entry.lookup.kind === "mixture" ? text.near(precision.blockMetres, namesOf(locale, entry.lookup)) : null}
              {entry.lookup.kind !== "empty" ? (
                <>
                  {" "}
                  <a href={exploreOverlayHref(locale, "provincial-ridings")}>{text.explore}</a>
                </>
              ) : null}
            </dd>
          ))}

          <dt>{text.region}</dt>
          <dd>
            {text.noRegion} <a href={exploreOverlayHref(locale, "economic-regions")}>{text.findOnMap}</a>
          </dd>
        </dl>
        <p className="shape-note">{text.precision(precision.blockMetres)}</p>
      </>
    );
  })();

  return (
    <section className="shape-circle-districts">
      <h3>{text.heading}</h3>
      {body}
    </section>
  );
}
