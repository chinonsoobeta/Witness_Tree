import matchingReport from "@/data/phase4-provincial-matching-report.json";
import { formatNumber } from "../domain/number";
import { provincialCauseWholeRecord } from "./provincial-cause";

/*
 * Le texte français de la page de méthode sur l’appariement provincial. Il est
 * dans son propre fichier parce que l’enregistrement de publication de la
 * phase 4 lie un fichier par langue. Les chiffres viennent du registre de
 * l’exécution elle-même.
 */
export function provincialMatchingTextFr(): string {
  const r = matchingReport;
  const reasons = r.nonMatchReasonDistribution;
  const n = (value: number) => formatNumber(value, "fr", 0);
  const pct = (value: number) => `${formatNumber(value * 100, "fr", 1)} %`;
  const cause = provincialCauseWholeRecord();
  const share = (hectares: number) => pct(hectares / cause.noNationalCauseHectares);
  return `Taux d’appariement : ${pct(r.matchRate)} des ${n(r.counts.assessedChanges)} changements détectés en Colombie-Britannique et au Québec de 1985 à 2022 correspondent à un registre officiel de coupe, de feu, d’insectes ou de chablis selon les tolérances ci-dessus. En superficie, c’est ${pct(r.areaWeighted.matchedShare)}, car les changements sans correspondance sont en moyenne plus petits. Taux de non-appariement : ${pct(r.nonMatchRate)}. Répartition des motifs de non-appariement : ${n(reasons["no-official-record-candidates"])} changements ne recoupent aucun registre officiel, ${n(reasons["outside-temporal-tolerance"])} recoupent un registre daté hors tolérance, ${n(reasons["below-spatial-tolerance"])} recoupent un registre sur moins de la moitié, et ${n(reasons["below-spatial-tolerance,outside-temporal-tolerance"])} échouent aux deux. Là où les rasters nationaux de perturbation ne consignent ni récolte ni feu, les registres provinciaux expliquent une partie du reste\u202F: des ${n(cause.noNationalCauseHectares)} ha de pertes détectées en Colombie-Britannique et au Québec sans cause nationale, ${share(cause.harvestHectares)} se trouvent dans des changements correspondant à un registre provincial de récolte, ${share(cause.fireHectares)} de feu et ${share(cause.insectOrWindthrowHectares)} d’insectes ou de chablis; ${share(cause.noRecordHectares)} n’ont pas non plus de registre provincial. Un changement sans registre ne veut pas dire qu’il ne s’est rien passé\u202F: le registre peut manquer, ne pas être publié ou viser une terre privée. Le propriétaire a admis et diffusé cette exécution le 26 septembre 2026; aucun examen provincial externe n’a eu lieu.`;
}
