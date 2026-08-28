"use client";

import { useEffect, useId, useState } from "react";
import type { Locale } from "@/lib/domain";
import {
  EXPLORE_MAP_COLOURS,
  EXPLORE_PRODUCTION_LAYER,
  type ExploreMode,
} from "@/lib/explore";

const text = {
  en: {
    label: "Verified province forest-loss map",
    loading: "Loading the verified 2020–2022 province aggregate map.",
    ready:
      "Showing the verified 2020–2022 province aggregate. Display boundaries are simplified and omit small islands. This is a technical preview, not per-cell forest-loss geometry.",
    unavailable:
      "A verified geographic layer is not available for this mode. Choose Forest change to view the 2020–2022 province aggregate.",
    unavailableYear:
      "The verified province aggregate covers 2020–2022 and is not shown for an earlier selected year. Choose 2022 or later to view it.",
    error:
      "The verified map layer could not be loaded. The list and table alternatives remain available.",
    attribution: "Map sources",
    legend: "Observed forest loss, percent of known forested hectares",
    province: "Province",
    period: "Period",
    lossHectares: "Observed loss (ha)",
    lossPercent: "Observed loss (%)",
    coverage: "Coverage",
    complete: "Complete required-input coverage",
  },
  fr: {
    label: "Carte vérifiée des pertes forestières provinciales",
    loading:
      "Chargement de la carte vérifiée de l’agrégat provincial de 2020 à 2022.",
    ready:
      "Affichage de l’agrégat provincial vérifié de 2020 à 2022. Les limites d’affichage sont simplifiées et omettent les petites îles. Il s’agit d’un aperçu technique, et non d’une géométrie de perte forestière par cellule.",
    unavailable:
      "Aucune couche géographique vérifiée n’est disponible pour ce mode. Choisissez Changement forestier pour voir l’agrégat provincial de 2020 à 2022.",
    unavailableYear:
      "L’agrégat provincial vérifié couvre la période de 2020 à 2022 et n’est pas affiché pour une année antérieure. Choisissez 2022 ou une année ultérieure pour le voir.",
    error:
      "La couche cartographique vérifiée n’a pas pu être chargée. Les autres présentations en liste et en tableau demeurent disponibles.",
    attribution: "Sources de la carte",
    legend:
      "Perte forestière observée, en pourcentage des hectares forestiers connus",
    province: "Province",
    period: "Période",
    lossHectares: "Perte observée (ha)",
    lossPercent: "Perte observée (%)",
    coverage: "Couverture",
    complete: "Couverture complète des entrées requises",
  },
} as const;

type Position = [number, number];
type ProvinceFeature = {
  id: string;
  properties: {
    observed_loss_percent: number;
    province_name_en: string;
    province_name_fr: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: Position[][] | Position[][][];
  };
};

const project = ([longitude, latitude]: Position) => [
  ((longitude + 141) / 89) * 1000,
  ((70 - latitude) / 30) * 500,
];
const ringPath = (ring: Position[]) =>
  `${ring.map((point, index) => `${index ? "L" : "M"}${project(point).join(" ")}`).join(" ")}Z`;
const featurePath = (feature: ProvinceFeature) => {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as Position[][]]
      : (feature.geometry.coordinates as Position[][][]);
  return polygons.flatMap((polygon) => polygon.map(ringPath)).join(" ");
};
const lossColour = (value: number) =>
  value >= 3
    ? EXPLORE_MAP_COLOURS.loss3
    : value >= 2
      ? EXPLORE_MAP_COLOURS.loss2
      : value >= 1
        ? EXPLORE_MAP_COLOURS.loss1
        : EXPLORE_MAP_COLOURS.loss0;
const symbol = (className: string) => (
  <i className={`loss-swatch ${className}`} aria-hidden="true" />
);

export function ExploreMapClient({
  locale,
  mode,
  year,
}: Readonly<{ locale: Locale; mode: ExploreMode; year: number }>) {
  const statusId = useId();
  const attributionId = useId();
  const available = mode === "forest-change" && year >= 2022;
  const [features, setFeatures] = useState<ProvinceFeature[]>([]);
  const [failed, setFailed] = useState(false);
  const state = !available
    ? "unavailable"
    : failed
      ? "error"
      : features.length
        ? "ready"
        : "loading";
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    fetch(EXPLORE_PRODUCTION_LAYER.compatibilityGeoJsonUrl, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Map response ${response.status}`);
        return response.json() as Promise<{ features: ProvinceFeature[] }>;
      })
      .then((collection: { features: ProvinceFeature[] }) => {
        if (
          collection.features.length !== EXPLORE_PRODUCTION_LAYER.rows.length
        ) {
          throw new Error("Unexpected province feature count");
        }
        setFeatures(collection.features);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setFailed(true);
      });
    return () => controller.abort();
  }, [available]);
  const message =
    state === "unavailable" && mode === "forest-change"
      ? text[locale].unavailableYear
      : text[locale][state];
  const number = new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    maximumFractionDigits: 2,
  });
  return (
    <section aria-label={text[locale].label}>
      <div
        className="explore-map"
        role="region"
        aria-label={text[locale].label}
        aria-describedby={`${statusId} ${attributionId}`}
        data-state={state}
      >
        {state === "ready" ? (
          <svg
            viewBox="0 0 1000 500"
            role="img"
            aria-label={text[locale].label}
          >
            <rect width="1000" height="500" fill={EXPLORE_MAP_COLOURS.ground} />
            {features.map((feature) => (
              <path
                key={feature.id}
                d={featurePath(feature)}
                fill={lossColour(feature.properties.observed_loss_percent)}
                stroke={EXPLORE_MAP_COLOURS.ink}
                strokeWidth="1.5"
                fillRule="evenodd"
              >
                <title>{`${locale === "fr" ? feature.properties.province_name_fr : feature.properties.province_name_en}: ${number.format(feature.properties.observed_loss_percent)}%`}</title>
              </path>
            ))}
          </svg>
        ) : (
          <p className="explore-map-panel">{message}</p>
        )}
      </div>
      <p
        id={statusId}
        className="explore-map-status"
        role={state === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {message}
      </p>
      <p id={attributionId} className="explore-map-attribution">
        {text[locale].attribution}:{" "}
        <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>
          {EXPLORE_PRODUCTION_LAYER.attribution[locale]}
        </a>
      </p>
      {available ? (
        <div className="explore-map-data">
          <strong>{text[locale].legend}</strong>
          <ul className="explore-map-legend" aria-label={text[locale].legend}>
            <li>{symbol("loss-0")}0–&lt;1%</li>
            <li>{symbol("loss-1")}1–&lt;2%</li>
            <li>{symbol("loss-2")}2–&lt;3%</li>
            <li>{symbol("loss-3")}3%+</li>
          </ul>
          <div className="table-scroll">
            <table>
              <caption>
                {text[locale].label}: {EXPLORE_PRODUCTION_LAYER.period}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{text[locale].province}</th>
                  <th scope="col">{text[locale].period}</th>
                  <th scope="col">{text[locale].lossHectares}</th>
                  <th scope="col">{text[locale].lossPercent}</th>
                  <th scope="col">{text[locale].coverage}</th>
                </tr>
              </thead>
              <tbody>
                {EXPLORE_PRODUCTION_LAYER.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.name[locale]}</th>
                    <td>{EXPLORE_PRODUCTION_LAYER.period}</td>
                    <td>{number.format(row.observedLossHectares)}</td>
                    <td>{number.format(row.observedLossPercent)}</td>
                    <td>{text[locale].complete}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
