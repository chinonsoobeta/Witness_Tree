import type { ComparisonPlace } from "@/lib/comparison";
import type { Locale } from "@/lib/domain";

const copy = {
  en: {
    title: "Find a federal electoral district",
    submit: "Find",
    guide: "Enter a district name in English or French.",
    none: "No federal district measurement matches this query.",
  },
  fr: {
    title: "Trouver une circonscription fédérale",
    submit: "Trouver",
    guide: "Entrez un nom de circonscription en français ou en anglais.",
    none: "Aucune mesure de circonscription fédérale ne correspond à cette recherche.",
  },
} as const;

/** Search normalization only. Rendered district names remain the source values. */
export function normalizeFederalDistrictSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-CA")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findFederalDistricts(
  query: string,
  rows: readonly ComparisonPlace[],
) {
  const needle = normalizeFederalDistrictSearch(query);
  if (!needle) return [];

  return rows
    .filter((row) => row.placeType === "federal-riding")
    .filter((row) => [row.name.en, row.name.fr].some((name) => normalizeFederalDistrictSearch(name).includes(needle)))
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function federalDistrictCompareHref(locale: Locale, districtId: string) {
  const path = locale === "en" ? "/en/compare" : "/fr/comparer";
  return `${path}?left=${encodeURIComponent(districtId)}`;
}

export function FederalDistrictFinder({
  locale,
  query,
  rows,
  parameters = [],
}: Readonly<{
  locale: Locale;
  query: string;
  rows: readonly ComparisonPlace[];
  parameters?: readonly Readonly<{ name: string; value: string }>[];
}>) {
  const text = copy[locale];
  const results = findFederalDistricts(query, rows);

  return (
    <section className="federal-district-finder">
      <h2>{text.title}</h2>
      <form className="search-form" method="get">
        {parameters.map((parameter) => (
          <input key={parameter.name} type="hidden" name={parameter.name} value={parameter.value} />
        ))}
        <div className="field">
          <label className="field-label sr-only" id="federal-district-label" htmlFor="federal-district-q">{text.title}</label>
          <input className="input" id="federal-district-q" name="district" defaultValue={query} aria-labelledby="federal-district-label" />
        </div>
        <button className="btn btn--primary" type="submit">{text.submit}</button>
      </form>
      {!query ? <p className="search-note">{text.guide}</p> : results.length ? (
        <ul className="search-results">
          {results.map((district) => (
            <li className="card card--lift search-result" key={district.id}>
              <a href={federalDistrictCompareHref(locale, district.id)}>{district.name[locale]}</a>
            </li>
          ))}
        </ul>
      ) : <p className="search-note">{text.none}</p>}
    </section>
  );
}
