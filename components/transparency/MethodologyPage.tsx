import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
import type { ConfidenceResult } from "@/lib/domain/confidence";
import type { Locale } from "@/lib/domain";
import {
  EXPLORE_COVERAGE_PERIOD,
  EXPLORE_DEFAULT_YEAR,
  EXPLORE_YEAR_MIN,
} from "@/lib/explore";

const COPY = {
  en: {
    title: "Methodology",
    statement: "How we sort evidence, and where it stops. A detected change alone shows neither the cause nor who is responsible.",
    confidenceRules: "How confidence is decided (the first rule that fits applies)",
    confidenceLevel: "Level and rule",
    confidenceCondition: "When it applies",
    definition: "Forest definition",
    definitionText:
      "Forest is land of at least 1 hectare where tree crowns cover at least 10% of the ground, with trees that can grow to 5 metres.",
    denominator: "What percentages measure",
    denominatorText:
      `Percentages are a share of the forest that existed at the start of the years you choose, not a share of all land. The record covers ${EXPLORE_COVERAGE_PERIOD.en}. The year control starts at ${EXPLORE_YEAR_MIN} because each year shows the change since the year before (${EXPLORE_YEAR_MIN} means ${EXPLORE_YEAR_MIN - 1} to ${EXPLORE_YEAR_MIN}); the default is ${EXPLORE_DEFAULT_YEAR}.`,
    coverage: "Geographic coverage",
    coverageText:
      "The record covers British Columbia, Alberta, Ontario and Quebec, using national data. Quebec north of 52° has national data only, with no extra local records. Coverage is worked out from the area actually mapped, not just from province names.",
    unmapped: "Where the source has no data",
    unmappedText:
      "The satellite land-cover source (NTEMS VLCE2) never mapped 46,424,717.91 hectares of these four provinces: 22,204,952.19 in Quebec, 15,372,023.76 in Alberta, 8,843,646.69 in Ontario and 4,095.27 in British Columbia. The source covers Canada’s forest regions, so it skips most of the prairies and settled south, and Quebec’s far north beyond where dense forest ends; in British Columbia the small gap is mostly along the shoreline. Unmapped does not mean there is no forest, and we never treat it that way.",
    unmappedKnowledge: "What we know about the unmapped area",
    unmappedKnowledgeText:
      "We don’t assume this area has no forest, and we hold dated records of forestry work there that are not yet cleared for public use. We tried estimating loss from satellite images back to 1984, but images can’t show whether the land met the forest definition (tree crowns covering at least 10% of the ground, trees able to reach 5 metres) in 1984, and a later start year didn’t help. Settling it would need field plots, air photos or lidar.",
    evidence: "Evidence and confidence",
    evidenceText:
      "Every fact is labelled as an official record, a satellite observation, a derived estimate or unknown. Here, unknown means no official record answers the question, which is different from land the source never mapped. Each fact also has a confidence level (high, medium, limited or unknown) with its reason, and never shown by colour alone.",
    accuracy: "Detection accuracy",
    accuracyText:
      "The data publisher cites a study of the earlier 2005 version of this land-cover map: it was 70.3% accurate overall (±2.5 percentage points, 95% confidence). That study does not measure how accurate our forest-loss detections are, for any district or year. So the accuracy of detected loss is Unknown.",
    accuracyLink: "Read the accuracy study",
    matching: "Matching to official records",
    matchingText:
      "A detected change matches an official record when they overlap by at least 50% of the smaller area and their dates are within ±2 years (±3 years before 1995). When events overlap in the same place and year, the one shown is picked in this order: fire; recorded harvest; recorded insect or disease disturbance; other recorded intervention; then detected change with no matching record. The other evidence is kept.",
    provincialMatching: "Provincial matching results",
    provincialMatchingText:
      "How often detected changes match provincial records is not available yet. No provincial dataset has been approved for processing, so any number here would be misleading.",
    limits: "What this record does not claim",
    limitsText:
      "We never label a detected change as logging, deforestation, a rule violation or the fault of a named organisation. Where no official record exists, we say so instead of filling in a number.",
  },
  fr: {
    title: "Méthodologie",
    statement: "Comment nous classons les preuves, et où elles s’arrêtent. Un changement détecté ne montre à lui seul ni la cause ni qui en est responsable.",
    confidenceRules: "Comment la confiance est établie (la première règle applicable est retenue)",
    confidenceLevel: "Niveau et règle",
    confidenceCondition: "Conditions d’application",
    definition: "Définition de la forêt",
    definitionText:
      "La forêt est une terre d’au moins 1 hectare où les cimes des arbres couvrent au moins 10 % du sol, avec des arbres pouvant atteindre 5 mètres.",
    denominator: "Ce que mesurent les pourcentages",
    denominatorText:
      `Les pourcentages sont une part de la forêt présente au début des années choisies, et non une part de tout le territoire. Le registre couvre la période de ${EXPLORE_COVERAGE_PERIOD.fr}. La commande d’année commence à ${EXPLORE_YEAR_MIN}, car chaque année montre le changement depuis l’année précédente (${EXPLORE_YEAR_MIN} correspond à ${EXPLORE_YEAR_MIN - 1} à ${EXPLORE_YEAR_MIN}); la vue par défaut est ${EXPLORE_DEFAULT_YEAR}.`,
    coverage: "Couverture géographique",
    coverageText:
      "Le registre couvre la Colombie-Britannique, l’Alberta, l’Ontario et le Québec, à partir de données nationales. Le Québec au nord du 52e degré n’a que des données nationales, sans registres locaux supplémentaires. La couverture est établie à partir de la zone réellement cartographiée, et non du seul nom de la province.",
    unmapped: "Là où la source n’a pas de données",
    unmappedText:
      "La source satellitaire de couverture terrestre (NTEMS VLCE2) n’a jamais cartographié 46 424 717,91 hectares de ces quatre provinces : 22 204 952,19 au Québec, 15 372 023,76 en Alberta, 8 843 646,69 en Ontario et 4 095,27 en Colombie-Britannique. La source couvre les régions forestières du Canada; elle laisse donc de côté la plupart des Prairies et du sud habité, ainsi que le Grand Nord québécois au-delà de la forêt dense. En Colombie-Britannique, le petit écart se situe surtout le long du littoral, et un territoire non cartographié n’est jamais traité comme dépourvu de forêt.",
    unmappedKnowledge: "Ce que nous savons du territoire non cartographié",
    unmappedKnowledgeText:
      "Nous ne supposons pas que ce territoire est sans forêt, et nous détenons des documents datés sur des travaux forestiers qui n’y sont pas encore autorisés pour un usage public. Nous avons tenté d’estimer la perte à partir d’images satellites remontant à 1984, mais les images ne montrent pas si le territoire répondait à la définition de la forêt (cimes couvrant au moins 10 % du sol, arbres pouvant atteindre 5 mètres) en 1984, et une année de départ plus récente n’a pas aidé. Pour trancher, il faudrait des placettes de terrain, des photos aériennes ou des données lidar.",
    evidence: "Preuves et confiance",
    evidenceText:
      "Chaque fait est classé comme registre officiel, observation satellitaire, estimation dérivée ou inconnu. Ici, « inconnu » veut dire qu’aucun registre officiel ne répond à la question, ce qui diffère d’un territoire que la source n’a jamais cartographié. Chaque fait a aussi un niveau de confiance (élevé, moyen, limité ou inconnu) accompagné de sa raison, jamais indiqué par la seule couleur.",
    accuracy: "Exactitude de la détection",
    accuracyText:
      "L’éditeur des données cite une étude de la version antérieure de 2005 de cette carte de couverture terrestre : elle était exacte à 70,3 % dans l’ensemble (±2,5 points de pourcentage, confiance de 95 %). Cette étude ne mesure pas l’exactitude de nos détections de perte forestière, pour aucune circonscription ni aucune année. L’exactitude de la perte détectée est donc inconnue.",
    accuracyLink: "Lire l’étude d’exactitude",
    matching: "Appariement aux registres officiels",
    matchingText:
      "Un changement détecté correspond à un registre officiel lorsqu’ils se chevauchent sur au moins 50 % de la plus petite superficie et que leurs dates sont à ±2 ans l’une de l’autre (±3 ans avant 1995). Lorsque des événements se chevauchent au même endroit la même année, celui qui est affiché est choisi dans cet ordre : incendie; récolte consignée; perturbation consignée par insecte ou maladie; autre intervention consignée; puis changement détecté sans registre correspondant. Les autres preuves sont conservées.",
    provincialMatching: "Résultats de l’appariement provincial",
    provincialMatchingText:
      "La fréquence à laquelle les changements détectés correspondent aux registres provinciaux n’est pas encore disponible. Aucun jeu de données provincial n’a été approuvé pour traitement; tout chiffre ici serait donc trompeur.",
    limits: "Ce que ce registre n’affirme pas",
    limitsText:
      "Nous ne qualifions jamais un changement détecté d’exploitation, de déforestation, d’infraction ou de faute d’une organisation désignée. Lorsqu’aucun registre officiel n’existe, nous le disons au lieu d’inscrire un chiffre.",
  },
} as const;

const CONFIDENCE_RULES: readonly Readonly<{
  id: ConfidenceResult["ruleId"];
  en: readonly [string, string];
  fr: readonly [string, string];
}>[] = [
  {
    id: "CONF-LIMITED-001",
    en: ["Limited", "There is a gap in coverage, the inventory was more than five years old at the time, or the mapping is coarser than 100 metres. This rule overrides the others."],
    fr: ["Limitée", "Il y a une lacune de couverture, l’inventaire avait plus de cinq ans au moment de l’événement, ou la cartographie est plus grossière que 100 mètres. Cette règle l’emporte sur les autres."],
  },
  {
    id: "CONF-HIGH-001",
    en: ["High", "An official record with a precise location, all required details, no shared attribution, and a date known to within one year. If the date’s uncertainty isn’t stated, the rule treats the date as exact."],
    fr: ["Élevée", "Un registre officiel avec un emplacement précis, tous les détails requis, aucune attribution partagée et une date connue à un an près. Si l’incertitude de la date n’est pas indiquée, la règle traite la date comme exacte."],
  },
  {
    id: "CONF-MEDIUM-001",
    en: ["Medium", "There is an official record or a precise location, but the rules above don’t apply. The reason shown explains what is missing, such as an uncertain date or a missing detail."],
    fr: ["Moyenne", "Il y a un registre officiel ou un emplacement précis, mais les règles ci-dessus ne s’appliquent pas. La raison affichée précise ce qui manque, comme une date incertaine ou un détail manquant."],
  },
  {
    id: "CONF-UNKNOWN-001",
    en: ["Unknown", "There is neither an official record nor a precise location, so nothing official answers this question yet."],
    fr: ["Inconnue", "Il n’y a ni registre officiel ni emplacement précis; rien d’officiel ne répond donc encore à cette question."],
  },
];

export function MethodologyPage({ locale }: Readonly<{ locale: Locale }>) {
  const copy = COPY[locale];
  const sections = [
    [copy.definition, copy.definitionText],
    [copy.denominator, copy.denominatorText],
    [copy.coverage, copy.coverageText],
    [copy.unmapped, copy.unmappedText],
    [copy.unmappedKnowledge, copy.unmappedKnowledgeText],
    [copy.evidence, copy.evidenceText],
    [copy.accuracy, copy.accuracyText],
    [copy.matching, copy.matchingText],
    [copy.provincialMatching, copy.provincialMatchingText],
    [copy.limits, copy.limitsText],
  ];

  return (
    <main id="main" className="page-wrap methods-page">
      <header className="masthead">
        <h1>{copy.title}</h1>
      </header>
      <CoverageStatement locale={locale}><p>{copy.statement}</p></CoverageStatement>
      <EvidenceLegend locale={locale} />
      <div className="content-section prose-measure">
        {sections.map(([heading, text], index) => (
          <section className="governance-section" key={heading} id={heading === copy.unmapped ? "coverage-gap" : undefined}>
            <p className="governance-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2>{heading}</h2>
            <p>{text}</p>
            {heading === copy.evidence ? (
              <table className="confidence-rules">
                <caption>{copy.confidenceRules}</caption>
                <thead><tr><th scope="col">{copy.confidenceLevel}</th><th scope="col">{copy.confidenceCondition}</th></tr></thead>
                <tbody>
                  {CONFIDENCE_RULES.map((rule) => (
                    <tr key={rule.id}>
                      <th scope="row">{rule[locale][0]}<code>{rule.id}</code></th>
                      <td>{rule[locale][1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {heading === copy.accuracy ? (
              <p>
                <a href="https://doi.org/10.1080/07038992.2018.1437719">
                  {copy.accuracyLink}
                </a>
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
