import { UNRANKED_COPY } from "@/components/comparison/RankedRidingsTable";
import { CONDITION_RECOVERY_COPY } from "@/components/explore/ConditionRecoveryFigures";
import { METHODOLOGY_COPY } from "@/components/transparency/MethodologyPage";
import { OFFICIAL_COMPARISON_WITHHELD } from "@/components/transparency/OfficialPublishedHarvestComparison";
import { MINIMUM_RANKED_FOREST_HECTARES } from "@/lib/comparison";
import { formatHectares, formatNumber, type Locale } from "@/lib/domain";
import { BOUNDARY_READOUT_WORDS } from "@/lib/explore/boundary-readout";
import { conditionRecoveryMeasurements, CONDITION_RECOVERY_CAUSES } from "@/lib/explore/condition-recovery";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";
import { blockedSourceRegister, formatRecordDate } from "@/lib/sources/blocked";
import { tooRecentNote, unmappedLand, withheldFigures, type ProvinceCode, type WithheldReasonClass, type WithheldRow } from "@/lib/unknown/atlas";

/*
 * French strings on this page are drafts for the owner's review (2026-10-28).
 * Every figure, list and reason comes from a record or from the wording the
 * other views already print; this page only arranges them.
 */
const COPY = {
  en: {
    title: "What the record cannot see",
    dek: "Land with no data, figures we withhold and sources we could not use, in one place. Each is read from the same records as the rest of the site. An Unknown is never zero.",
    landTitle: "Land with no data",
    landLead: (total: string) => `The satellite source has no data for ${total} of the four provinces.`,
    noLoss: "Missing data never means no loss.",
    chartLabel: "Share of each province with no satellite data",
    landCaption: "Land with no satellite data, by province",
    province: "Province",
    area: "Area with no data",
    share: "Share of the province",
    where: "Where it lies",
    methodsLink: "How the gap was found, in the methods",
    withheldTitle: "Figures withheld",
    withheldLead: "These figures exist in the record or would be computed from it, but each view leaves them out rather than show a number it cannot stand behind. The list below is built from the same data the views use.",
    withheldCaption: "Figures withheld, by view",
    view: "View",
    what: "What is withheld",
    reason: "Reason",
    words: "In the view’s own words",
    views: {
      "official-harvest-comparison": "Official harvest comparison",
      compare: "Compare ridings",
      "explore-provincial-ridings": "Explore map, provincial ridings",
      "condition-recovery": "Explore, condition and recovery",
    },
    reasons: {
      licence: "Licence",
      coverage: "Coverage",
      floor: `Under the ${MINIMUM_RANKED_FOREST_HECTARES} ha floor`,
      "too-recent": "Too recent",
      "not-mapped": "Not mapped",
    } satisfies Record<WithheldReasonClass, string>,
    licenceWhat: (count: string, from: number, to: number, provinces: string) =>
      `${count} published official harvest values for ${from} to ${to} (${provinces})`,
    federalCoverageWhat: (count: string, provinces: string) => `The share of forest lost in ${count} federal ridings, which are left out of the ranking (${provinces})`,
    provincialCoverageWhat: (count: string, from: number, to: number, provinces: string) =>
      `The share of forest lost from ${from} to ${to} in ${count} provincial ridings (${provinces})`,
    federalFloorWhat: (count: string, provinces: string) =>
      `The ranking of ${count} fully mapped federal ridings with less than ${MINIMUM_RANKED_FOREST_HECTARES} ha of forest (${provinces})`,
    recoveryFloorWhat: (count: string, items: string) => `The share treed again for ${count} ${count === "1" ? "group" : "groups"}: ${items}`,
    recoveryFloorNone: "Nothing at present. Every province, region, decade and cause the view shows lost at least 500 ha of tree cover. The regions under the floor are the ones with nothing mapped, listed below.",
    tooRecentWhat: (from: number, to: number) =>
      `A conclusion on recovery after losses from ${from} to ${to}. The share is shown, marked as too recent to judge.`,
    notMappedWhat: (count: string, names: string) => `Loss and recovery in ${count} economic regions with nothing mapped: ${names}`,
    fourProvinces: "four provinces",
    decade: (label: string) => `losses in ${label}`,
    or: "or",
    blockedTitle: "Sources we could not use",
    blockedLead: "Each of these sources would add something the record lacks, but its holder has not given terms that allow it to be reused here, so the record does not use it.",
    blockedCaption: "Sources we could not use, as recorded",
    agency: "Agency or publisher",
    adds: "What it would add",
    condition: "Licence or access condition",
    lastRequest: "Last request",
    status: "Status, as recorded",
    asOf: (ledger: string, rights: string) => `Statuses are as recorded on ${rights}. The source ledger they start from is dated ${ledger}.`,
    notListed: (usable: string, withdrawn: string, on: string) =>
      `Not listed: ${usable} sources that were blocked in the ledger and are now open or granted, and ${withdrawn} reserve and treaty boundary sources, which were withdrawn from the record’s scope on ${on}.`,
    settleTitle: "What would settle it",
    settleLead: "What it would take to turn each Unknown into a figure, as the methods describe it.",
    reuseTitle: "Written reuse terms",
    reuseText: "A source listed above can be used only once its holder gives written terms that allow public reuse, or publishes it under an open licence with a complete copy to download.",
    reuseLink: "The sources we could not use",
    readMethods: "Read it in the methods",
  },
  fr: {
    title: "Ce que le registre ne peut pas voir",
    dek: "Le territoire sans données, les chiffres que nous ne présentons pas et les sources que nous n’avons pas pu utiliser, au même endroit. Chaque élément provient des mêmes registres que le reste du site. Une valeur inconnue n’est jamais zéro.",
    landTitle: "Territoire sans données",
    landLead: (total: string) => `La source satellitaire n’a pas de données pour ${total} des quatre provinces.`,
    noLoss: "Des données manquantes ne signifient jamais une absence de perte.",
    chartLabel: "Part de chaque province sans données satellitaires",
    landCaption: "Territoire sans données satellitaires, par province",
    province: "Province",
    area: "Superficie sans données",
    share: "Part de la province",
    where: "Où elle se trouve",
    methodsLink: "Comment la lacune a été établie, dans la méthodologie",
    withheldTitle: "Chiffres non présentés",
    withheldLead: "Ces chiffres existent dans le registre ou pourraient en être tirés, mais chaque vue les écarte plutôt que d’afficher un nombre qu’elle ne peut pas appuyer. La liste ci-dessous est produite à partir des mêmes données que les vues.",
    withheldCaption: "Chiffres non présentés, par vue",
    view: "Vue",
    what: "Ce qui n’est pas présenté",
    reason: "Motif",
    words: "Dans les mots de la vue",
    views: {
      "official-harvest-comparison": "Comparaison avec la récolte officielle",
      compare: "Comparer les circonscriptions",
      "explore-provincial-ridings": "Carte Explorer, circonscriptions provinciales",
      "condition-recovery": "Explorer, état et rétablissement",
    },
    reasons: {
      licence: "Licence",
      coverage: "Couverture",
      floor: `Sous le seuil de ${MINIMUM_RANKED_FOREST_HECTARES} ha`,
      "too-recent": "Trop récent",
      "not-mapped": "Non cartographié",
    } satisfies Record<WithheldReasonClass, string>,
    licenceWhat: (count: string, from: number, to: number, provinces: string) =>
      `${count} valeurs officielles publiées de récolte, de ${from} à ${to} (${provinces})`,
    federalCoverageWhat: (count: string, provinces: string) =>
      `La part de forêt perdue dans ${count} circonscriptions fédérales, exclues du classement (${provinces})`,
    provincialCoverageWhat: (count: string, from: number, to: number, provinces: string) =>
      `La part de forêt perdue de ${from} à ${to} dans ${count} circonscriptions provinciales (${provinces})`,
    federalFloorWhat: (count: string, provinces: string) =>
      `Le classement de ${count} circonscriptions fédérales entièrement cartographiées comptant moins de ${MINIMUM_RANKED_FOREST_HECTARES} ha de forêt (${provinces})`,
    recoveryFloorWhat: (count: string, items: string) => `La part redevenue boisée pour ${count} ${count === "1" ? "groupe" : "groupes"}\u202F: ${items}`,
    recoveryFloorNone: "Rien pour l’instant. Chaque province, région, décennie et cause que montre la vue a perdu au moins 500 ha de couvert arboré. Les régions sous le seuil sont celles où rien n’a été cartographié, énumérées plus bas.",
    tooRecentWhat: (from: number, to: number) =>
      `Une conclusion sur le rétablissement après les pertes de ${from} à ${to}. La part est affichée, avec la mention qu’il est trop tôt pour conclure.`,
    notMappedWhat: (count: string, names: string) => `La perte et le rétablissement dans ${count} régions économiques où rien n’a été cartographié\u202F: ${names}`,
    fourProvinces: "quatre provinces",
    decade: (label: string) => `pertes de ${label}`,
    or: "ou",
    blockedTitle: "Sources que nous n’avons pas pu utiliser",
    blockedLead: "Chacune de ces sources apporterait ce qui manque au registre, mais son détenteur n’a pas donné de conditions permettant de la réutiliser ici\u202F; le registre ne l’utilise donc pas.",
    blockedCaption: "Sources que nous n’avons pas pu utiliser, telles que consignées",
    agency: "Organisme ou éditeur",
    adds: "Ce qu’elle apporterait",
    condition: "Licence ou condition d’accès",
    lastRequest: "Dernière demande",
    status: "Statut consigné",
    asOf: (ledger: string, rights: string) => `Les statuts sont ceux consignés le ${rights}. Le registre des sources dont ils partent est daté du ${ledger}.`,
    notListed: (usable: string, withdrawn: string, on: string) =>
      `Ne figurent pas ici\u202F: ${usable} sources bloquées dans le registre des sources qui sont maintenant ouvertes ou autorisées, et ${withdrawn} sources sur les limites des réserves et des traités, retirées de la portée du registre le ${on}.`,
    settleTitle: "Ce qui permettrait de trancher",
    settleLead: "Ce qu’il faudrait pour transformer chaque valeur inconnue en chiffre, tel que la méthodologie le décrit.",
    reuseTitle: "Conditions de réutilisation écrites",
    reuseText: "Une source de la liste ci-dessus ne peut être utilisée qu’une fois que son détenteur a donné par écrit des conditions qui en permettent la réutilisation publique, ou qu’il la publie sous une licence ouverte avec une copie complète à télécharger.",
    reuseLink: "Les sources que nous n’avons pas pu utiliser",
    readMethods: "Le lire dans la méthodologie",
  },
} as const;

const ROUTES = {
  en: { methods: "/en/methods" },
  fr: { methods: "/fr/methodes" },
} as const;

const ACCURACY_STUDY = "https://doi.org/10.1080/07038992.2018.1437719";

function list(items: readonly string[], locale: Locale) {
  return new Intl.ListFormat(locale === "en" ? "en-CA" : "fr-CA", { style: "long", type: "conjunction" }).format(items);
}

function WithheldWhat({ row, locale, names }: Readonly<{ row: WithheldRow; locale: Locale; names: ReadonlyMap<ProvinceCode, string> }>) {
  const text = COPY[locale];
  const count = formatNumber(row.items.length, locale, 0);
  const provinces = row.byProvince
    ? list(
        (Object.entries(row.byProvince) as [ProvinceCode, number][])
          .filter(([, value]) => value > 0)
          .map(([code, value]) => `${names.get(code)} ${formatNumber(value, locale, 0)}`),
        locale,
      )
    : "";
  switch (row.id) {
    case "licence-official-harvest-comparison":
      return <>{text.licenceWhat(count, row.years!.from, row.years!.to, provinces)}</>;
    case "coverage-compare-federal":
      return <>{text.federalCoverageWhat(count, provinces)}</>;
    case "coverage-explore-provincial":
      return <>{text.provincialCoverageWhat(count, row.years!.from, row.years!.to, provinces)}</>;
    case "floor-compare-federal":
      return <>{text.federalFloorWhat(count, provinces)}</>;
    case "floor-condition-recovery": {
      if (!row.items.length) return <>{text.recoveryFloorNone}</>;
      const recovery = new Map(conditionRecoveryMeasurements().map((entry) => [entry.id, entry.name[locale]]));
      const causeNames = CONDITION_RECOVERY_COPY[locale].causeNames;
      const labels = row.items.map((item) =>
        (CONDITION_RECOVERY_CAUSES as readonly string[]).includes(item)
          ? `${causeNames[item as keyof typeof causeNames]} (${text.fourProvinces})`
          : /^\d{4}-\d{4}$/.test(item)
            ? `${text.decade(item.replace("-", "–"))} (${text.fourProvinces})`
            : recovery.get(item) ?? item,
      );
      return <>{text.recoveryFloorWhat(count, list(labels, locale))}</>;
    }
    case "too-recent-condition-recovery":
      return <>{text.tooRecentWhat(row.years!.from, row.years!.to)}</>;
    case "not-mapped-condition-recovery":
      return <>{text.notMappedWhat(count, list((row.names ?? []).map((name) => name[locale]), locale))}</>;
    default:
      throw new Error(`No wording for withheld row ${row.id}.`);
  }
}

/** The sentence or label each view already prints, quoted rather than retyped. */
function viewWords(row: WithheldRow, locale: Locale): readonly string[] {
  const recovery = CONDITION_RECOVERY_COPY[locale];
  switch (row.reasonClass) {
    case "licence":
      return [OFFICIAL_COMPARISON_WITHHELD[locale]];
    case "coverage":
      return row.view === "compare"
        ? [UNRANKED_COPY[locale].noneMapped, UNRANKED_COPY[locale].partial]
        : [BOUNDARY_READOUT_WORDS[locale].none, BOUNDARY_READOUT_WORDS[locale].partial];
    case "floor":
      return row.view === "compare" ? [UNRANKED_COPY[locale].belowFloor] : [recovery.floor, recovery.withheld];
    case "too-recent": {
      const note = tooRecentNote();
      return note ? [note[locale]] : [];
    }
    case "not-mapped":
      return [recovery.unmappedNote];
  }
}

export function UnknownAtlasPage({ locale }: Readonly<{ locale: Locale }>) {
  const text = COPY[locale];
  const land = unmappedLand();
  const names = new Map(land.provinces.map((province) => [province.code, province.name[locale]]));
  const withheld = withheldFigures();
  const register = blockedSourceRegister();
  const methods = METHODOLOGY_COPY[locale];
  const date = (value: string) => formatRecordDate(value, locale);

  return (
    <>
      <header className="masthead">
        <h1>{text.title}</h1>
        <p className="dek">{text.dek}</p>
      </header>

      <section className="content-section" id="no-data" aria-labelledby="no-data-title">
        <h2 id="no-data-title">{text.landTitle}</h2>
        <p>{text.landLead(formatHectares(land.totalHectares, locale, 2))}</p>
        <ul className="explore-chart unknown-atlas-chart" aria-label={text.chartLabel}>
          {land.provinces.map((province) => (
            <li key={province.id}>
              <span className="explore-bar-name">{province.name[locale]}</span>
              <span className="explore-bar-label">{formatUnknownSharePercent(province.unmappedSharePercent, locale)}</span>
              <span className="explore-bar-track" aria-hidden="true">
                <span className="explore-bar explore-bar--unmapped" style={{ width: `${province.unmappedSharePercent}%` }} />
              </span>
            </li>
          ))}
        </ul>
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="no-data-caption">
          <table>
            <caption id="no-data-caption">{text.landCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{text.province}</th>
                <th scope="col">{text.area}</th>
                <th scope="col">{text.share}</th>
                <th scope="col">{text.where}</th>
              </tr>
            </thead>
            <tbody>
              {land.provinces.map((province) => (
                <tr key={province.id}>
                  <th scope="row">{province.name[locale]}</th>
                  <td>{formatHectares(province.unmappedHectares, locale, 2)}</td>
                  <td>{formatUnknownSharePercent(province.unmappedSharePercent, locale)}</td>
                  <td>{province.reason[locale]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><strong>{text.noLoss}</strong></p>
        <p><a href={`${ROUTES[locale].methods}#coverage-gap`}>{text.methodsLink}</a></p>
      </section>

      <section className="content-section" id="withheld" aria-labelledby="withheld-title">
        <h2 id="withheld-title">{text.withheldTitle}</h2>
        <p className="prose-measure">{text.withheldLead}</p>
        <div className="table-scroll unknown-atlas-table" tabIndex={0} role="region" aria-labelledby="withheld-caption">
          <table>
            <caption id="withheld-caption">{text.withheldCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{text.view}</th>
                <th scope="col">{text.what}</th>
                <th scope="col">{text.reason}</th>
                <th scope="col">{text.words}</th>
              </tr>
            </thead>
            <tbody>
              {withheld.map((row) => (
                <tr key={row.id} data-withheld={row.id} data-count={row.items.length}>
                  <th scope="row"><a href={row.href[locale]}>{text.views[row.view]}</a></th>
                  <td><WithheldWhat row={row} locale={locale} names={names} /></td>
                  <td>{text.reasons[row.reasonClass]}</td>
                  <td>
                    {viewWords(row, locale).map((words, index) => (
                      <span key={words}>
                        {index > 0 ? ` ${text.or} ` : null}
                        <q>{words}</q>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-section" id="blocked-sources" aria-labelledby="blocked-title">
        <h2 id="blocked-title">{text.blockedTitle}</h2>
        <p className="prose-measure">{text.blockedLead}</p>
        <div className="table-scroll unknown-atlas-table" tabIndex={0} role="region" aria-labelledby="blocked-caption">
          <table>
            <caption id="blocked-caption">{text.blockedCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{text.agency}</th>
                <th scope="col">{text.adds}</th>
                <th scope="col">{text.condition}</th>
                <th scope="col">{text.lastRequest}</th>
                <th scope="col">{text.status}</th>
              </tr>
            </thead>
            <tbody>
              {register.sources.map((source) => (
                <tr key={source.id} data-blocked-source={source.id}>
                  <th scope="row">
                    {source.agency[locale]}
                    <span className="unknown-atlas-source-title">{source.title[locale]}</span>
                  </th>
                  <td>{source.adds[locale]}</td>
                  <td>{source.condition[locale]}</td>
                  <td>{source.lastRequest.label[locale]} {date(source.lastRequest.date)}.</td>
                  <td>{source.status.label[locale]} {date(source.status.date)}.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="prose-measure">{text.asOf(date(register.ledgerAsOf), date(register.rightsRecordedOn))}</p>
        <p className="prose-measure">
          {text.notListed(
            formatNumber(register.notListed.usable.length, locale, 0),
            formatNumber(register.notListed.withdrawn.length, locale, 0),
            date(register.notListed.withdrawnOn),
          )}
        </p>
      </section>

      <section className="content-section prose-measure" id="settle" aria-labelledby="settle-title">
        <h2 id="settle-title">{text.settleTitle}</h2>
        <p>{text.settleLead}</p>
        <h3>{methods.unmappedKnowledge}</h3>
        <p>{methods.unmappedKnowledgeText}</p>
        <p><a href={`${ROUTES[locale].methods}#coverage-gap`}>{text.readMethods}</a></p>
        <h3>{text.reuseTitle}</h3>
        <p>{text.reuseText}</p>
        <p><a href="#blocked-sources">{text.reuseLink}</a></p>
        <h3>{methods.accuracy}</h3>
        <p>{methods.accuracyText}</p>
        <p><a href={ACCURACY_STUDY}>{methods.accuracyLink}</a></p>
      </section>
    </>
  );
}

/** For metadata and links: the page's title in each language. */
export const UNKNOWN_ATLAS_ROUTES = { en: "/en/unknown", fr: "/fr/inconnu" } as const;
