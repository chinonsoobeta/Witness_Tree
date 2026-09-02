"use client";

/**
 * The address field.
 *
 * Everything about this control is shaped by one rule: the address never
 * enters the page's own address. So the form does not navigate, the query goes
 * out as a POST body, and nothing typed here is written to the URL, to history
 * or to a link. The point that comes back is resolved separately, and the
 * district route is given coordinates rather than the text they came from.
 *
 * The search runs on submit rather than on each keystroke. That is the cost
 * decision recorded in the plan, and it is also the smaller disclosure: one
 * request carrying a whole address rather than one per character carrying its
 * prefixes.
 */

import { useId, useRef, useState } from "react";
import type { Locale } from "@/lib/domain";
import { ADDRESS_QUERY_MAX_LENGTH } from "@/lib/address";

type Point = Readonly<{ id: string; label: string; latitude: number; longitude: number }>;
type Named = Readonly<{ districtId: string; name: Record<Locale, string> }>;
type Lookup =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "single"; districtId: string; name: Record<Locale, string> }>
  | Readonly<{ kind: "mixture"; candidates: readonly Named[] }>;
type Resolved = Readonly<{
  federal: Lookup;
  provincial: readonly Readonly<{ layerId: string; lookup: Lookup }>[];
  precision: Readonly<{ blockMetres: number; metresFromBlockEdge: number }>;
}>;

const copy = {
  en: {
    title: "Find the district for an address",
    label: "Address",
    submit: "Find districts",
    searching: "Searching",
    resolving: "Reading the district index",
    guide: "Enter a Canadian address. It is sent to look up its location and is not kept.",
    privacy: "The address is never written into this page's web address, its links, or its history.",
    results: "Choose the matching address",
    none: "No address matched that search.",
    failed: "The address could not be looked up just now.",
    resolveFailed: "The district index could not be read just now.",
    federal: "Federal district",
    provincial: "Provincial district",
    outside: "This point is outside the area the index covers.",
    near: (names: string, metres: number) =>
      `This point sits within ${metres} m of a district boundary, so the index cannot separate them. It is in one of: ${names}.`,
    precision: (block: number) =>
      `Resolved on a ${block} m grid. A point within ${block} m of a boundary is reported as being near one rather than inside either.`,
    compare: "See measurements",
    provinces: {
      "bc-2023": "British Columbia",
      "ab-2019": "Alberta",
      "on-2022": "Ontario",
      "qc-2026": "Quebec",
    } as Record<string, string>,
  },
  fr: {
    title: "Trouver la circonscription d'une adresse",
    label: "Adresse",
    submit: "Trouver les circonscriptions",
    searching: "Recherche en cours",
    resolving: "Lecture de l'index des circonscriptions",
    guide: "Entrez une adresse canadienne. Elle sert à trouver son emplacement et n'est pas conservée.",
    privacy:
      "L'adresse n'est jamais inscrite dans l'adresse web de cette page, ni dans ses liens, ni dans son historique.",
    results: "Choisissez l'adresse correspondante",
    none: "Aucune adresse ne correspond à cette recherche.",
    failed: "L'adresse n'a pas pu être trouvée pour le moment.",
    resolveFailed: "L'index des circonscriptions n'a pas pu être lu pour le moment.",
    federal: "Circonscription fédérale",
    provincial: "Circonscription provinciale",
    outside: "Ce point est à l'extérieur du territoire couvert par l'index.",
    near: (names: string, metres: number) =>
      `Ce point se trouve à moins de ${metres} m d'une limite de circonscription, et l'index ne peut donc pas les départager. Il est dans l'une des suivantes : ${names}.`,
    precision: (block: number) =>
      `Résolu sur une grille de ${block} m. Un point situé à moins de ${block} m d'une limite est signalé comme étant près d'une limite plutôt que dans l'une ou l'autre.`,
    compare: "Voir les mesures",
    provinces: {
      "bc-2023": "Colombie-Britannique",
      "ab-2019": "Alberta",
      "on-2022": "Ontario",
      "qc-2026": "Québec",
    } as Record<string, string>,
  },
} as const;

function comparePath(locale: Locale, districtId: string) {
  const path = locale === "en" ? "/en/compare" : "/fr/comparer";
  return `${path}?left=${encodeURIComponent(districtId)}`;
}

function DistrictReadout({
  locale,
  heading,
  lookup,
  linkable,
}: Readonly<{ locale: Locale; heading: string; lookup: Lookup; linkable: boolean }>) {
  const text = copy[locale];
  if (lookup.kind === "empty") return null;
  return (
    <div className="address-district">
      <h4 className="address-district-heading">{heading}</h4>
      {lookup.kind === "single" ? (
        <p className="address-district-name">
          {lookup.name[locale]}
          {linkable ? (
            <>
              {" "}
              <a href={comparePath(locale, lookup.districtId)}>{text.compare}</a>
            </>
          ) : null}
        </p>
      ) : (
        <p className="address-district-name">
          {lookup.candidates.map((candidate) => candidate.name[locale]).join(", ")}
        </p>
      )}
    </div>
  );
}

export function AddressFinderClient({ locale }: Readonly<{ locale: Locale }>) {
  const text = copy[locale];
  const fieldId = useId();
  const [query, setQuery] = useState("");
  const [points, setPoints] = useState<readonly Point[] | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [chosen, setChosen] = useState<Point | null>(null);
  const [status, setStatus] = useState<"idle" | "searching" | "resolving">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || status !== "idle") return;
    setStatus("searching");
    setProblem(null);
    setPoints(null);
    setResolved(null);
    setChosen(null);
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
      setProblem(text.failed);
    } finally {
      setStatus("idle");
    }
  }

  async function choose(point: Point) {
    if (status !== "idle") return;
    setStatus("resolving");
    setProblem(null);
    setChosen(point);
    setResolved(null);
    try {
      const response = await fetch("/api/district/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: point.latitude, longitude: point.longitude }),
      });
      if (response.status === 422) {
        setProblem(text.outside);
        return;
      }
      if (!response.ok) throw new Error("resolve");
      setResolved((await response.json()) as Resolved);
    } catch {
      setProblem(text.resolveFailed);
    } finally {
      setStatus("idle");
    }
  }

  const federalMixture = resolved?.federal.kind === "mixture" ? resolved.federal : null;

  return (
    <section className="address-finder">
      <h2>{text.title}</h2>
      <form className="search-form" onSubmit={search}>
        <div className="field">
          <label className="field-label" htmlFor={fieldId}>
            {text.label}
          </label>
          <input
            className="input"
            id={fieldId}
            name="address"
            type="text"
            autoComplete="street-address"
            maxLength={ADDRESS_QUERY_MAX_LENGTH}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={status !== "idle" || !query.trim()}>
          {status === "searching" ? text.searching : text.submit}
        </button>
      </form>
      <p className="search-note">{text.guide}</p>
      <p className="search-note">{text.privacy}</p>

      <div ref={resultsRef} aria-live="polite">
        {problem ? <p className="search-note address-problem">{problem}</p> : null}

        {points && points.length === 0 && !problem ? <p className="search-note">{text.none}</p> : null}

        {points && points.length > 0 && !resolved ? (
          <>
            <h3 className="address-results-heading">{text.results}</h3>
            <ul className="search-results">
              {points.map((point) => (
                <li className="card card--lift search-result" key={point.id}>
                  <button className="search-result-choice" type="button" onClick={() => choose(point)}>
                    {point.label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {resolved && chosen ? (
          <div className="address-resolved">
            <p className="address-chosen">{chosen.label}</p>
            {federalMixture ? (
              <p className="search-note">
                {text.near(
                  federalMixture.candidates.map((candidate) => candidate.name[locale]).join(", "),
                  resolved.precision.blockMetres,
                )}
              </p>
            ) : null}
            <DistrictReadout
              locale={locale}
              heading={text.federal}
              lookup={resolved.federal}
              linkable={resolved.federal.kind === "single"}
            />
            {resolved.provincial.map((entry) => (
              <DistrictReadout
                key={entry.layerId}
                locale={locale}
                heading={`${text.provincial} (${text.provinces[entry.layerId] ?? entry.layerId})`}
                lookup={entry.lookup}
                linkable={false}
              />
            ))}
            <p className="search-note">{text.precision(resolved.precision.blockMetres)}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
