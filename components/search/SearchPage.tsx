import type { ReactNode } from "react";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { colon, formatHectares, formatPercent, semicolon, type Locale } from "@/lib/domain";
import { federalRidingComparison } from "@/lib/comparison";
import { FederalDistrictFinder } from "./FederalDistrictFinder";
import { AddressFinderClient } from "./AddressFinderClient";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";
import { formatSearchShare, searchAttribution, searchSite, ridingSearchRow, type SearchRidingReference, type SiteSearchResult } from "@/lib/search/site-search";
import { cleanSearchQuery, splitUnknownRows, unknownGroupHeading, type UnknownGroup, type UnknownGroupNoun } from "@/lib/search/shared";
import { NoRecordResult } from "./NoRecordResult";
import { SearchSuggest } from "./SearchSuggest";
import { EvidenceKey } from "@/components/policy/EvidenceKey";
import { placeDetail, resultMeta, ridingCompareHref, ridingFigure, ridingFigureIsDetected } from "@/lib/search/suggest";
import { placeFigure } from "@/lib/search/place-figures";
import { communityPagePath, ridingPagePath } from "@/lib/place-pages/paths";

export type SearchScope = "places" | "districts";

const copy = {
  en: {
    title: "Search",
    scope: "Search scope",
    places: "Places",
    districts: "Federal ridings",
    notice: "Search provinces, ridings and communities. Figures cover 1984 to 2022.",
    shareNote: "Each riding’s share is how much of the place lies inside it. The riding figures are for the whole riding.",
    lost: "of the mapped forest detected as lost",
    figureLabel: { province: "Whole province, 1984–2022", riding: "Whole riding, 1984–2022", community: "This community, 1984–2022" },
    ridingLists: { federal: "Federal ridings it lies in (figures for 1984–2022)", provincial: "Provincial ridings it lies in (figures for 1984–2022)" },
  },
  fr: {
    title: "Recherche",
    scope: "Portée de la recherche",
    places: "Lieux",
    districts: "Circonscriptions fédérales",
    notice: "Recherchez une province, une circonscription ou une collectivité. Les chiffres couvrent la période de 1984 à 2022.",
    shareNote: "La part de chaque circonscription indique quelle partie du lieu s’y trouve. Les chiffres des circonscriptions portent sur toute la circonscription.",
    lost: "de la forêt cartographiée détectée comme perdue",
    figureLabel: { province: "Toute la province, 1984–2022", riding: "Toute la circonscription, 1984–2022", community: "Cette collectivité, 1984–2022" },
    ridingLists: { federal: "Circonscriptions fédérales où elle se trouve (chiffres pour 1984–2022)", provincial: "Circonscriptions provinciales où elle se trouve (chiffres pour 1984–2022)" },
  },
} as const;

const KIND_NOUN: Readonly<Record<SiteSearchResult["kind"], UnknownGroupNoun>> = {
  community: "communities",
  riding: "ridings",
  province: "provinces",
};

/** The results past the page's limit: how many, of what, and how to reach them. */
function moreResults(kind: SiteSearchResult["kind"], count: number, locale: Locale) {
  const one = count === 1;
  if (locale === "en") {
    const noun = { community: one ? "community" : "communities", riding: one ? "riding" : "ridings", province: one ? "province" : "provinces" }[kind];
    return `${count} more ${noun} ${one ? "matches and isn’t" : "match and aren’t"} listed here. Type more of the name, or add a province, to narrow the search.`;
  }
  const noun = { community: one ? "collectivité" : "collectivités", riding: one ? "circonscription" : "circonscriptions", province: one ? "province" : "provinces" }[kind];
  return one
    ? `1 autre ${noun} correspond mais n’est pas affichée ici. Précisez le nom ou ajoutez une province pour affiner la recherche.`
    : `${count} autres ${noun} correspondent mais ne sont pas affichées ici. Précisez le nom ou ajoutez une province pour affiner la recherche.`;
}

export function SearchPage({
  locale,
  query: rawQuery,
  scope = "places",
  addressLookup = false,
}: Readonly<{
  locale: Locale;
  query: string;
  scope?: SearchScope;
  /**
   * Whether the address field can actually work. Decided by the route from the
   * worker's stamped headers, never by this component and never by the caller,
   * so a field that cannot answer is not offered.
   */
  addressLookup?: boolean;
}>) {
  const text = copy[locale];
  // A query of nothing but spaces is no query: the page asks for a place.
  const query = cleanSearchQuery(rawQuery);
  return (
    <section className="page-wrap search-page">
      <header className="masthead">
        <h1>{text.title}</h1>
      </header>

      <CoverageStatement locale={locale}>
        <p>{text.notice}</p>
        <p>{locale === "en"
          ? "Finding a place doesn’t mean we have figures for it. And a missing record doesn’t mean nothing happened."
          : "Trouver un lieu ne veut pas dire que nous avons des chiffres pour celui-ci. Et l’absence de registre ne veut pas dire que rien ne s’est produit."}</p>
      </CoverageStatement>
      <nav className="segment" aria-label={text.scope}>
        <a
          className="segment-option"
          href="?scope=places"
          aria-current={scope === "places" ? "page" : undefined}
        >
          {text.places}
        </a>
        <a
          className="segment-option"
          href="?scope=districts"
          aria-current={scope === "districts" ? "page" : undefined}
        >
          {text.districts}
        </a>
      </nav>

      {scope === "places" ? (
        <section>
          <h2>{text.places}</h2>
          <SearchSuggest
            className="search-page-field"
            locale={locale}
            action={locale === "en" ? "/en/search" : "/fr/recherche"}
            label={text.places}
            labelHidden
            submitLabel={locale === "en" ? "Find" : "Trouver"}
            defaultValue={query}
          />
          {!query ? <p className="search-note">{locale === "en" ? "Enter a province, riding, or community." : "Entrez une province, une circonscription ou une collectivité."}</p> : <SearchResults locale={locale} query={query} />}
        </section>
      ) : (
        <>
          {addressLookup ? <AddressFinderClient
            locale={locale}
            measuredDistrictIds={federalRidingComparison.places
              .filter((place) => place.detectedChangeHectares !== null)
              .map((place) => place.id)}
          /> : null}
          <FederalDistrictFinder
            locale={locale}
            query={query}
            rows={federalRidingComparison.places}
          />
        </>
      )}
    </section>
  );
}

/**
 * Same-reason Unknowns gathered under one line that gives their count and
 * reason; the line opens to the rows, each still stating its own Unknown.
 */
function UnknownGroups<T>({ groups, noun, locale, render }: Readonly<{
  groups: readonly UnknownGroup<T>[];
  noun: UnknownGroupNoun;
  locale: Locale;
  render: (rows: readonly T[]) => ReactNode;
}>) {
  return <>{groups.map((group) => (
    <details key={group.reason} className="search-unknown-group">
      <summary>
        <span className="mark-glyph mark-glyph--unknown" aria-hidden="true" />
        <span>{unknownGroupHeading(group.reason, group.rows.length, noun, locale)}</span>
      </summary>
      {render(group.rows)}
    </details>
  ))}</>;
}

function SearchResults({ locale, query }: { locale: Locale; query: string }) {
  const text = copy[locale];
  const page = searchSite(query);
  if (!page.results.length) return <NoRecordResult locale={locale} reason={locale === "en" ? "No released place, riding, or community record matches this query." : "Aucun registre publié de province, de circonscription ou de collectivité ne correspond à cette recherche."} remedies />;
  const groups = (["community", "riding", "province"] as const).map((kind) => [kind, page.results.filter((result) => result.kind === kind)] as const);
  const groupTitle = {
    en: { province: "Provinces", riding: "Ridings", community: "Communities" },
    fr: { province: "Provinces", riding: "Circonscriptions", community: "Collectivités" },
  }[locale];
  const cards = (results: readonly SiteSearchResult[]) => (
    <ul className="search-results">{results.map((result) => <SearchResultCard key={`${result.kind}-${result.id}`} locale={locale} result={result} />)}</ul>
  );
  return <>
    <div className="search-results-key">
      <EvidenceKey locale={locale} classes={["satellite-observation", "unknown"]} />
    </div>
    {groups.map(([kind, results]) => {
      if (!results.length) return null;
      // Measured places and the place named exactly are listed; many Unknowns
      // for the same reason read as one line with their count.
      const { listed, groups: unknown } = splitUnknownRows(results, (result) => result.unknownReason, (result) => result.score === 0);
      return (
        <section key={kind} aria-label={groupTitle[kind]}>
          <h3>{groupTitle[kind]}</h3>
          {listed.length ? cards(listed) : null}
          <UnknownGroups groups={unknown} noun={KIND_NOUN[kind]} locale={locale} render={cards} />
          {page.more[kind] > 0 ? <p className="search-note">{moreResults(kind, page.more[kind], locale)}</p> : null}
        </section>
      );
    })}
    {page.results.some((result) => result.kind === "community") ? <>
      <p className="search-note">{text.shareNote}</p>
      <p className="search-note">{searchAttribution(locale)}</p>
    </> : null}
  </>;
}

function resultName(result: SiteSearchResult, locale: Locale) {
  return locale === "fr" && result.nameFr ? result.nameFr : result.name;
}

function ridingReferenceMarkup(reference: SearchRidingReference, locale: Locale) {
  const row = ridingSearchRow(reference.id);
  const name = locale === "fr" ? reference.nameFr : reference.name;
  const href = ridingPagePath(locale, reference.id);
  const label = href ? <a href={href}>{name}</a> : name;
  return <li key={reference.id}>{label}{colon(locale)} {formatSearchShare(reference.share, locale)}{row ? <>. {locale === "en" ? "Whole riding" : "Toute la circonscription"}{colon(locale)} {ridingFigure(row, locale)}</> : null}</li>;
}

/** The ridings a community lies in: measured ones listed, many same-reason Unknowns as one line. */
function RidingReferences({ references, level, locale }: Readonly<{ references: readonly SearchRidingReference[]; level: "federal" | "provincial"; locale: Locale }>) {
  if (!references.length) {
    return <ul><li>{level === "federal"
      ? (locale === "en" ? "No federal riding is recorded for this community." : "Aucune circonscription fédérale n’est enregistrée pour cette collectivité.")
      : (locale === "en" ? "No provincial riding is recorded for this community." : "Aucune circonscription provinciale n’est enregistrée pour cette collectivité.")}</li></ul>;
  }
  const { listed, groups } = splitUnknownRows(references, (reference) => reference.unknownReason);
  const list = (rows: readonly SearchRidingReference[]) => <ul>{rows.map((reference) => ridingReferenceMarkup(reference, locale))}</ul>;
  return <>
    {listed.length ? list(listed) : null}
    <UnknownGroups groups={groups} noun={level === "federal" ? "federal-ridings" : "provincial-ridings"} locale={locale} render={list} />
  </>;
}

/** Which figure a line shows and over what span, such as "Whole riding, 1984–2022:". */
function FigureLabel({ kind, locale }: Readonly<{ kind: SiteSearchResult["kind"]; locale: Locale }>) {
  return <span className="search-result-figure-label">{copy[locale].figureLabel[kind]}{colon(locale)}</span>;
}

function SearchResultCard({ locale, result }: { locale: Locale; result: SiteSearchResult }) {
  // The kind label follows the name in reading order and is drawn above it.
  const kind = <p className="eyebrow search-result-kind">{resultMeta(result, locale)}</p>;
  if (result.kind === "province") {
    const unknown = locale === "en" ? "Unknown" : "Inconnu";
    const text = copy[locale];
    return <li className="card card--lift search-result">
      <h4>{resultName(result, locale)}</h4>
      {kind}
      <p className="search-result-figure"><span className="mark-glyph mark-glyph--satellite" aria-hidden="true" /><span><FigureLabel kind="province" locale={locale} /> {result.unionLossHectares === null || result.unionLossHectares === undefined ? unknown : formatHectares(result.unionLossHectares, locale)} · {result.unionLossPercent === null || result.unionLossPercent === undefined ? unknown : `${formatPercent(result.unionLossPercent, locale)} ${text.lost}`}</span></p>
      <p className="search-result-figure"><span className="mark-glyph mark-glyph--unknown" aria-hidden="true" /><span>{result.unknownHectares === null || result.unknownHectares === undefined ? unknown : formatHectares(result.unknownHectares, locale)} {locale === "en" ? "Unknown area" : "de superficie inconnue"}{semicolon(locale)} {result.unknownSharePercent === null || result.unknownSharePercent === undefined ? unknown : formatUnknownSharePercent(result.unknownSharePercent, locale)}</span></p>
      {result.unmappedCharacter ? <p>{locale === "en" ? "Here that gap is" : "Ici, la lacune se trouve"} {result.unmappedCharacter[locale]}.</p> : null}
    </li>;
  }
  if (result.kind === "riding") {
    const row = ridingSearchRow(result.id);
    // A riding opens on its own page; a federal one also opens in Compare,
    // which does not cover provincial ridings.
    const href = ridingPagePath(locale, result.id);
    const compareHref = ridingCompareHref(result.id, locale);
    return <li className="card card--lift search-result">
      <h4>{href ? <a href={href}>{resultName(result, locale)}</a> : resultName(result, locale)}</h4>
      {kind}
      <p className="search-result-figure"><span className={`mark-glyph ${ridingFigureIsDetected(row) ? "mark-glyph--satellite" : "mark-glyph--unknown"}`} aria-hidden="true" /><span><FigureLabel kind="riding" locale={locale} /> {ridingFigure(row, locale)}</span></p>
      {compareHref ? <p><a href={compareHref}>{locale === "en" ? "Compare this riding" : "Comparer cette circonscription"}</a></p> : null}
    </li>;
  }
  const figure = placeFigure(result.id);
  const text = copy[locale];
  return <li className="card card--lift search-result">
    <h4><a href={communityPagePath(locale, result.id)}>{resultName(result, locale)}</a></h4>
    {kind}
    <p className="search-result-figure"><span className={`mark-glyph ${ridingFigureIsDetected(figure) ? "mark-glyph--satellite" : "mark-glyph--unknown"}`} aria-hidden="true" /><span><FigureLabel kind="community" locale={locale} /> {figure?.coverage === "complete" && figure.observedLossPercent !== null ? `${formatPercent(figure.observedLossPercent, locale)} ${text.lost} · ` : null}{placeDetail(figure, locale)}</span></p>
    <p>{text.ridingLists.federal}</p>
    <RidingReferences references={result.federal ?? []} level="federal" locale={locale} />
    <p>{text.ridingLists.provincial}</p>
    <RidingReferences references={result.provincial ?? []} level="provincial" locale={locale} />
  </li>;
}
