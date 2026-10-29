import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_PURPOSE, type Locale } from "@/lib/domain";

export const SITE_ORIGIN = "https://www.witnesstree.ca";

export const PUBLIC_LOCALE_ROUTE_PAIRS = [
  { en: "/en", fr: "/fr" },
  { en: "/en/explore", fr: "/fr/explorer" },
  { en: "/en/explore/draw", fr: "/fr/explorer/dessiner" },
  { en: "/en/compare", fr: "/fr/comparer" },
  { en: "/en/search", fr: "/fr/recherche" },
  { en: "/en/methods", fr: "/fr/methodes" },
  { en: "/en/data", fr: "/fr/donnees" },
  { en: "/en/data/official-harvest-comparison", fr: "/fr/donnees/comparaison-recolte-officielle" },
  { en: "/en/data/bc-harvest-volume", fr: "/fr/donnees/volume-recolte-bc" },
  { en: "/en/data/provincial-harvest-volume", fr: "/fr/donnees/volume-recolte-provinces" },
  { en: "/en/data/harvest-and-fire", fr: "/fr/donnees/recolte-et-incendies" },
  { en: "/en/unknown", fr: "/fr/inconnu" },
  { en: "/en/wildfire", fr: "/fr/incendies" },
  { en: "/en/about", fr: "/fr/a-propos" },
  { en: "/en/account", fr: "/fr/compte" },
  { en: "/en/components", fr: "/fr/composants" },
  { en: "/en/glossary", fr: "/fr/glossaire" },
  { en: "/en/corrections", fr: "/fr/corrections" },
  { en: "/en/terms", fr: "/fr/conditions" },
] as const;

type PublicRoutePair = (typeof PUBLIC_LOCALE_ROUTE_PAIRS)[number];
type RouteText = Readonly<{ title: Readonly<Record<Locale, string>>; description: Readonly<Record<Locale, string>> }>;

/*
 * Each public page's own title and one-sentence description, in both
 * languages, keyed by its English path. The root layout's template appends the
 * product name to the title. A title stays short enough to show whole in a
 * search result, and no two pages in a language share one.
 */
export const PUBLIC_ROUTE_TEXT: Readonly<Record<PublicRoutePair["en"], RouteText>> = {
  "/en": {
    title: { en: "Forest loss in four provinces, 1984 to 2022", fr: "Pertes forestières dans quatre provinces" },
    description: {
      en: "Forest loss detected by satellite in British Columbia, Alberta, Ontario and Québec from 1984 to 2022, with the evidence and limits of each figure.",
      fr: "La perte forestière détectée par satellite en C.-B., en Alberta, en Ontario et au Québec de 1984 à 2022, avec la preuve et les limites de chaque chiffre.",
    },
  },
  "/en/explore": {
    title: { en: "Map of forest loss, 1984 to 2022", fr: "Carte des pertes forestières, 1984 à 2022" },
    description: {
      en: "Map the forest loss detected over any span from 1984 to 2022 by province, riding, region or town, with harvest, fire and recovery views.",
      fr: "Cartographiez la perte forestière détectée de 1984 à 2022 par province, circonscription, région ou ville, avec la récolte, le feu et le rétablissement.",
    },
  },
  "/en/explore/draw": {
    title: { en: "Measure forest loss in an area you draw", fr: "Mesurer la perte forestière d’une zone" },
    description: {
      en: "Draw a shape on the map to measure the forest loss inside it, with land that has no data shown apart and never counted as zero.",
      fr: "Tracez une forme sur la carte pour mesurer la perte forestière qu’elle contient, le territoire sans données étant présenté à part, jamais comme zéro.",
    },
  },
  "/en/compare": {
    title: { en: "Compare forest loss by federal riding", fr: "Comparer les circonscriptions fédérales" },
    description: {
      en: "Set two federal ridings side by side, or rank them by the share of mapped forest detected as lost from 2021 to 2022.",
      fr: "Comparez deux circonscriptions fédérales ou classez-les selon la part de forêt cartographiée détectée comme perdue de 2021 à 2022.",
    },
  },
  "/en/search": {
    title: { en: "Search places and ridings", fr: "Rechercher un lieu ou une circonscription" },
    description: {
      en: "Find a province, riding or community and see how much of its mapped forest was detected as lost from 1984 to 2022.",
      fr: "Trouvez une province, une circonscription ou une collectivité et voyez quelle part de sa forêt cartographiée a été perdue de 1984 à 2022.",
    },
  },
  "/en/methods": {
    title: { en: "How the forest-loss figures are made", fr: "Comment les chiffres de perte sont établis" },
    description: {
      en: "What counts as forest, how loss is detected and totalled, how confidence is set, and where the record stops.",
      fr: "Ce qui compte comme forêt, comment la perte est détectée et totalisée, comment la confiance est établie et où le registre s’arrête.",
    },
  },
  "/en/data": {
    title: { en: "Download forest-loss data and sources", fr: "Télécharger les données et les sources" },
    description: {
      en: "Province forest-loss figures as CSV, GeoPackage and JSON, a bounded technical preview, with checksums, licences and source records.",
      fr: "Les chiffres provinciaux de perte forestière en CSV, GeoPackage et JSON, un aperçu technique limité, avec sommes de contrôle, licences et sources.",
    },
  },
  "/en/data/official-harvest-comparison": {
    title: { en: "Detected loss and official harvest figures", fr: "Perte détectée et récolte officielle" },
    description: {
      en: "Forest loss detected in each province shown next to official harvested-area statistics, with the rounding and coverage limits of each value.",
      fr: "La perte forestière détectée dans chaque province, à côté des statistiques officielles de superficie récoltée, avec les limites d’arrondi et de couverture.",
    },
  },
  "/en/data/bc-harvest-volume": {
    title: { en: "BC harvest volume and allowable annual cut", fr: "Récolte et possibilité de coupe en C.-B." },
    description: {
      en: "How much timber British Columbia billed each year, next to the allowable annual cut, from the province’s published summary data.",
      fr: "Le volume de bois facturé chaque année en Colombie-Britannique, à côté de la possibilité annuelle de coupe, d’après les données sommaires de la province.",
    },
  },
  "/en/data/provincial-harvest-volume": {
    title: { en: "Harvest volume in Alberta, Ontario and Québec", fr: "Récolte en Alberta, en Ontario et au Québec" },
    description: {
      en: "How much timber Alberta, Ontario and Québec harvested from their own land each year, next to the wood supply each province set.",
      fr: "Le volume de bois récolté chaque année sur les terres de l’Alberta, de l’Ontario et du Québec, à côté de l’approvisionnement fixé par chaque province.",
    },
  },
  "/en/data/harvest-and-fire": {
    title: { en: "Harvest and fire by province, 1985 to 2022", fr: "Récolte et feu par province, 1985 à 2022" },
    description: {
      en: "Forest cleared by harvest and by fire in BC, Alberta, Ontario and Québec each year from 1985 to 2022, as charts, a table and downloads.",
      fr: "La forêt récoltée et la forêt brûlée chaque année de 1985 à 2022 dans les quatre provinces, en graphiques, en tableau et en téléchargements.",
    },
  },
  "/en/unknown": {
    title: { en: "What the record cannot see", fr: "Ce que le registre ne peut pas voir" },
    description: {
      en: "Land with no satellite data, figures the site withholds and sources it could not use, in one place; an Unknown is never zero.",
      fr: "Le territoire sans données satellitaires, les chiffres non présentés et les sources inutilisables, au même endroit; une valeur inconnue n’est jamais zéro.",
    },
  },
  "/en/wildfire": {
    title: { en: "Where to find current wildfire information", fr: "Où trouver l’information sur les feux actuels" },
    description: {
      en: "This site shows no live wildfires, so go to your provincial agency for current fires, evacuations and emergency instructions.",
      fr: "Ce site ne montre pas les feux en cours, alors consultez l’organisme provincial pour les feux actuels, les évacuations et les consignes d’urgence.",
    },
  },
  "/en/about": {
    title: { en: "Who made this site and why", fr: "Qui a créé ce site et pourquoi" },
    description: {
      en: "Why this public record of forest loss was started, what it answers, and what it does not estimate.",
      fr: "Pourquoi ce registre public des pertes forestières a été lancé, ce à quoi il répond et ce qu’il n’estime pas.",
    },
  },
  "/en/account": {
    title: { en: "Accounts and alerts, not open yet", fr: "Comptes et alertes, pas encore ouverts" },
    description: {
      en: "Accounts are not active in this preview, and this page sets out what accounts and alerts will do and what must be in place first.",
      fr: "Les comptes ne sont pas actifs dans cet aperçu, et cette page présente ce que permettront les comptes et les alertes et ce qu’il faut d’abord.",
    },
  },
  "/en/components": {
    title: { en: "How figures show evidence and coverage", fr: "Comment les chiffres montrent leur preuve" },
    description: {
      en: "What the evidence, confidence, coverage and source marks on every figure mean, with an example of each.",
      fr: "Ce que signifient les marques de preuve, de confiance, de couverture et de source sur chaque chiffre, avec un exemple de chacune.",
    },
  },
  "/en/glossary": {
    title: { en: "Glossary of forest-loss terms", fr: "Glossaire des termes du registre" },
    description: {
      en: "Plain definitions of forest, evidence, coverage, Unknown and the other terms used in Explore and Compare.",
      fr: "Définitions simples de forêt, de preuve, de couverture, d’inconnu et des autres termes employés dans Explorer et Comparer.",
    },
  },
  "/en/corrections": {
    title: { en: "Reporting and tracking corrections", fr: "Signaler et suivre les corrections" },
    description: {
      en: "How to note a possible error in a figure or source, how corrections will be handled, and the public record of corrections.",
      fr: "Comment noter une erreur possible dans un chiffre ou une source, comment les corrections seront traitées et le registre public des corrections.",
    },
  },
  "/en/terms": {
    title: { en: "Terms of use, licences and attribution", fr: "Conditions, licences et attribution" },
    description: {
      en: "What this record is and is not, how to read and reuse it, and the licence and credit for every source it draws on.",
      fr: "Ce que ce registre est et n’est pas, comment le lire et le réutiliser, et la licence et le crédit de chaque source utilisée.",
    },
  },
};

/**
 * A public page's title, description and canonical record. The locale home
 * page shares its segment with the root layout, whose title template does not
 * reach it, so the home title carries the product name itself.
 */
export function routeMetadata(locale: Locale, paths: PublicRoutePair): Metadata {
  const text = PUBLIC_ROUTE_TEXT[paths.en];
  const title = paths.en === "/en" ? { absolute: `${text.title[locale]} · ${PRODUCT_NAME[locale]}` } : text.title[locale];
  return { title, description: text.description[locale], alternates: localizedAlternates(locale, paths) };
}

/**
 * Metadata every root layout shares. There is no single root layout to inherit
 * it from: each locale owns its own `<html>` element so the document language
 * is correct, which means each root layout has to export the whole record.
 */
export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: PRODUCT_NAME.en,
    template: `%s · ${PRODUCT_NAME.en}`,
  },
  description: PRODUCT_PURPOSE.en,
  // A cream conifer on moss, in the site's own colours. iOS home screens, and
  // browsers that do not take an SVG icon, read the PNG.
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    title: PRODUCT_NAME.en,
    description: PRODUCT_PURPOSE.en,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${PRODUCT_NAME.en} / ${PRODUCT_NAME.fr}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME.en,
    description: PRODUCT_PURPOSE.en,
    images: ["/og.png"],
  },
};

/**
 * The shared record in the served language, for a locale root layout. A French
 * page is titled and described in French and ends in the French name, rather
 * than every tab carrying the English name whatever language the page is in.
 */
export function localeMetadata(locale: Locale): Metadata {
  return {
    ...siteMetadata,
    title: { default: PRODUCT_NAME[locale], template: `%s · ${PRODUCT_NAME[locale]}` },
    description: PRODUCT_PURPOSE[locale],
    openGraph: { ...siteMetadata.openGraph, title: PRODUCT_NAME[locale], description: PRODUCT_PURPOSE[locale], locale: locale === "en" ? "en_CA" : "fr_CA" },
    twitter: { ...siteMetadata.twitter, title: PRODUCT_NAME[locale], description: PRODUCT_PURPOSE[locale] },
    other: { "content-language": locale },
  };
}

export function localizedAlternates(
  locale: Locale,
  paths: Readonly<{ en: string; fr: string }>,
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: paths[locale],
    languages: { en: paths.en, fr: paths.fr },
  };
}

export const gatewayAlternates: NonNullable<Metadata["alternates"]> = {
  canonical: "/",
  languages: { en: "/en", fr: "/fr", "x-default": "/" },
};
