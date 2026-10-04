import { colon, formatHectares, formatNumber, formatPercent, type Locale } from "@/lib/domain";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";
// Types only: the release itself stays on the server and arrives as props.
import type { ConditionRecoveryCause, ConditionRecoveryMeasurement, ConditionRecoveryView } from "@/lib/explore/condition-recovery";

const COPY = {
  en: {
    heading: "Did the trees grow back?",
    lead: (lost: string, share: string) =>
      `Of the ~${lost} million hectares that lost tree cover over the 38-year interval in the four provinces, ${share} regained its cover at least 5 years in a row after its most recent loss.`,
    unknown: (area: string) =>
      `${area} is Unknown because at least one year there is unclassified or missing. It’s left out, not counted as zero.`,
    meaning:
      "“Treed” means the yearly land-cover map shows coniferous, broadleaf or mixed trees. This measures trees coming back, not the return of the forest that was there: a young plantation and an old stand both count as treed.",
    floor: "Where less than 500 ha lost tree cover, the share is withheld. Where nothing was mapped, loss and recovery are Unknown.",
    provinces: "By province",
    decades: "By decade of the latest loss, four provinces",
    decadesLead:
      "Older losses have had longer to grow back. Losses since 2015 have had at most seven years and need five of them treed, so that decade is too recent to judge.",
    causes: "By recorded cause of the latest loss, four provinces",
    causesLead: "The cause is what the national disturbance record shows for the year of the loss. Much of the loss has no recorded cause.",
    regions: "By economic region",
    regionsLead: "The map shades these same regions, Statistics Canada’s 2021 economic regions.",
    survey: "Checked against provincial surveys",
    place: "Place",
    province: "Province",
    lost: "Lost tree cover (ha)",
    latest: "Treed again after the latest loss",
    anyColumn: "After any loss",
    unconfirmedColumn: "Not yet confirmable",
    unknownColumn: "Unknown share of the area",
    decade: "Decade of the latest loss",
    recovered: "Treed again",
    note: "Note",
    cause: "Recorded cause",
    shareOfLost: "Share of the loss",
    withheld: "Withheld (under 500 ha)",
    unknownValue: "Unknown",
    notMapped: "Not mapped",
    underTenth: "Under 0.1%",
    chartLabel: "Share treed again after the latest loss",
    causeNames: { notRecorded: "No cause recorded", fire: "Fire", harvest: "Harvest", fireAndHarvest: "Fire and harvest" },
    tableCaption: (heading: string) => `Condition and recovery${colon("en")} ${heading.toLowerCase()}`,
  },
  fr: {
    heading: "Les arbres ont-ils repoussé\u202F?",
    lead: (lost: string, share: string) =>
      `Sur les quelque ${lost}\u00a0millions d’hectares qui ont perdu leur couvert arboré au cours de la période de 38\u00a0ans dans les quatre provinces, ${share} ont retrouvé ce couvert au moins 5\u00a0années de suite après leur dernière perte.`,
    unknown: (area: string) =>
      `${area} sont inconnus parce qu’au moins une année y est non classée ou manquante. Ils sont exclus, et non comptés comme zéro.`,
    meaning:
      "«\u00a0Boisé\u00a0» signifie que la carte annuelle de couverture terrestre montre des conifères, des feuillus ou un peuplement mixte. On mesure le retour des arbres, et non celui de la forêt qui s’y trouvait\u202F: une jeune plantation et un vieux peuplement comptent tous deux comme boisés.",
    floor: "Lorsque moins de 500 ha ont perdu leur couvert arboré, la part n’est pas présentée. Là où rien n’a été cartographié, la perte et le rétablissement sont inconnus.",
    provinces: "Par province",
    decades: "Par décennie de la dernière perte, quatre provinces",
    decadesLead:
      "Les pertes plus anciennes ont eu plus de temps pour se rétablir. Les pertes depuis 2015 ont eu au plus sept ans et doivent être boisées pendant cinq d’entre eux\u202F: cette décennie est trop récente pour conclure.",
    causes: "Par cause consignée de la dernière perte, quatre provinces",
    causesLead: "La cause est ce que le registre national des perturbations indique pour l’année de la perte. Une grande partie de la perte n’a aucune cause consignée.",
    regions: "Par région économique",
    regionsLead: "La carte ombre ces mêmes régions, les régions économiques de 2021 de Statistique Canada.",
    survey: "Comparaison avec les relevés provinciaux",
    place: "Lieu",
    province: "Province",
    lost: "Couvert arboré perdu (ha)",
    latest: "Redevenu boisé après la dernière perte",
    anyColumn: "Après une perte quelconque",
    unconfirmedColumn: "Pas encore confirmable",
    unknownColumn: "Part inconnue de la superficie",
    decade: "Décennie de la dernière perte",
    recovered: "Redevenu boisé",
    note: "Remarque",
    cause: "Cause consignée",
    shareOfLost: "Part de la perte",
    withheld: "Non présenté (moins de 500 ha)",
    unknownValue: "Inconnu",
    notMapped: "Non cartographiée",
    underTenth: "Moins de 0,1\u00a0%",
    chartLabel: "Part redevenue boisée après la dernière perte",
    causeNames: { notRecorded: "Aucune cause consignée", fire: "Incendie", harvest: "Récolte", fireAndHarvest: "Incendie et récolte" },
    tableCaption: (heading: string) => `État et rétablissement${colon("fr")} ${heading.toLowerCase()}`,
  },
} as const;

const PROVINCE_FOR_PREFIX: Readonly<Record<string, Readonly<{ en: string; fr: string }>>> = {
  "59": { en: "British Columbia", fr: "Colombie-Britannique" },
  "48": { en: "Alberta", fr: "Alberta" },
  "35": { en: "Ontario", fr: "Ontario" },
  "24": { en: "Québec", fr: "Québec" },
};

const PROVINCE_ORDER = ["59", "48", "35", "24"];

/** Statistics Canada joins two names with "--"; it reads as a dash. */
const regionName = (name: string) => name.replace(/--/g, "–");

const decadeLabel = (decade: string, locale: Locale) => decade.replace("-", locale === "fr" ? " à " : "–");

/** The four-province headline, shared by Explore and the home page. */
export function ConditionRecoveryHeadline({ four, locale }: Readonly<{ four: ConditionRecoveryMeasurement; locale: Locale }>) {
  const text = COPY[locale];
  const pct = (value: number | null) => (value === null ? text.withheld : formatPercent(Math.round(value * 10) / 10, locale));
  return (
    <div className="recovery-headline">
      <p className="recovery-lead">{text.lead(formatNumber(Math.round(four.lostHectares / 1e5) / 10, locale, 1), pct(four.latestRecoveredPercent))}</p>
      {four.latestRecoveredPercent !== null ? (
        <span className="recovery-bar" aria-hidden="true">
          <span className="recovery-bar-part recovery-bar-part--recovered" style={{ width: `${four.latestRecoveredPercent}%` }} />
        </span>
      ) : null}
      <p>{text.unknown(formatHectares(Math.round(four.unknownHectares), locale, 0))}</p>
    </div>
  );
}

export function ConditionRecoveryFigures({
  view,
  locale,
  data,
}: Readonly<{ view: ConditionRecoveryView; locale: Locale; data: "chart" | "table" }>) {
  const text = COPY[locale];
  const four = view.rows.find((row) => row.kind === "four-provinces");
  const provinces = view.rows.filter((row) => row.kind === "province");
  const regions = [...view.rows.filter((row) => row.kind === "region")].sort(
    (left, right) => PROVINCE_ORDER.indexOf(left.id.slice(0, 2)) - PROVINCE_ORDER.indexOf(right.id.slice(0, 2)) || (right.latestRecoveredPercent ?? -1) - (left.latestRecoveredPercent ?? -1),
  );
  if (!four) return null;
  const pct = (value: number | null) => (value === null ? text.withheld : formatPercent(Math.round(value * 10) / 10, locale));
  const ha = (value: number) => formatHectares(Math.round(value), locale, 0).replace(/\s?ha$/, "");
  const bars = (rows: readonly Readonly<{ key: string; name: string; percent: number | null }>[]) => (
    <ul className="explore-chart" aria-label={text.chartLabel}>
      {rows.map((row) => (
        <li key={row.key}>
          <span className="explore-bar-name">{row.name}</span>
          <span className="explore-bar-label">{pct(row.percent)}</span>
          <span className="explore-bar-track" aria-hidden="true">
            <span className="explore-bar explore-bar--recovery" style={{ width: `${row.percent ?? 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
  const placeTable = (id: string, heading: string, rows: readonly ConditionRecoveryMeasurement[], withProvince: boolean) => (
    <div className="table-scroll" tabIndex={0} role="region" aria-labelledby={id}>
      <table className="explore-table">
        <caption id={id}>{text.tableCaption(heading)}</caption>
        <thead>
          <tr>
            <th scope="col">{text.place}</th>
            {withProvince ? <th scope="col">{text.province}</th> : null}
            <th scope="col">{text.lost}</th>
            <th scope="col">{text.latest}</th>
            <th scope="col">{text.anyColumn}</th>
            <th scope="col">{text.unconfirmedColumn}</th>
            <th scope="col">{text.unknownColumn}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{regionName(row.name[locale])}</th>
              {withProvince ? <td>{PROVINCE_FOR_PREFIX[row.id.slice(0, 2)]?.[locale] ?? ""}</td> : null}
              <td>{row.mapped ? ha(row.lostHectares) : text.unknownValue}</td>
              <td>{row.mapped ? pct(row.latestRecoveredPercent) : text.notMapped}</td>
              <td>{row.belowFloor ? "–" : pct(row.anyRecoveredPercent)}</td>
              <td>{row.belowFloor ? "–" : pct(row.unconfirmedPercent)}</td>
              <td>{formatUnknownSharePercent(row.unknownSharePercent, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="recovery-figures">
      <h3>{text.heading}</h3>
      <ConditionRecoveryHeadline four={four} locale={locale} />
      <p>{text.meaning}</p>

      <h3 id="recovery-provinces">{text.provinces}</h3>
      {data === "chart"
        ? bars(provinces.map((row) => ({ key: row.id, name: row.name[locale], percent: row.latestRecoveredPercent })))
        : placeTable("recovery-provinces-caption", text.provinces, [...provinces, four], false)}

      <h3>{text.decades}</h3>
      <p>{text.decadesLead}</p>
      {data === "chart" ? (
        bars(four.decades.map((row) => ({ key: row.decade, name: decadeLabel(row.decade, locale), percent: row.recoveredPercent })))
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="recovery-decades-caption">
          <table className="explore-table">
            <caption id="recovery-decades-caption">{text.tableCaption(text.decades)}</caption>
            <thead><tr><th scope="col">{text.decade}</th><th scope="col">{text.lost}</th><th scope="col">{text.recovered}</th><th scope="col">{text.note}</th></tr></thead>
            <tbody>
              {four.decades.map((row) => (
                <tr key={row.decade}>
                  <th scope="row">{decadeLabel(row.decade, locale)}</th>
                  <td>{ha(row.lostHectares)}</td>
                  <td>{pct(row.recoveredPercent)}</td>
                  <td>{row.note ? row.note[locale] : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>{text.causes}</h3>
      <p>{text.causesLead}</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="recovery-causes-caption">
        <table className="explore-table">
          <caption id="recovery-causes-caption">{text.tableCaption(text.causes)}</caption>
          <thead><tr><th scope="col">{text.cause}</th><th scope="col">{text.lost}</th><th scope="col">{text.shareOfLost}</th><th scope="col">{text.recovered}</th></tr></thead>
          <tbody>
            {four.causes.map((row) => (
              <tr key={row.cause}>
                <th scope="row">{text.causeNames[row.cause as ConditionRecoveryCause]}</th>
                <td>{ha(row.lostHectares)}</td>
                <td>{row.shareOfLostPercent > 0 && row.shareOfLostPercent < 0.05 ? text.underTenth : formatPercent(Math.round(row.shareOfLostPercent * 10) / 10, locale)}</td>
                <td>{pct(row.recoveredPercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>{text.regions}</h3>
      <p>{text.regionsLead} {text.floor}</p>
      {placeTable("recovery-regions-caption", text.regions, regions, true)}

      <h3>{text.survey}</h3>
      <p>{view.resultsAgreement.note[locale]}</p>
    </div>
  );
}
