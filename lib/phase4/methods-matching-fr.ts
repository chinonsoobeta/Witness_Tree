import matchingReport from "@/data/phase4-provincial-matching-report.json";
import { formatNumber } from "../domain/number";

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
  return `Taux d’appariement : ${pct(r.matchRate)} des ${n(r.counts.assessedChanges)} changements détectés en Colombie-Britannique et au Québec de 1985 à 2022 correspondent à un registre officiel de coupe, de feu, d’insectes ou de chablis selon les tolérances ci-dessus; en superficie, ${pct(r.areaWeighted.matchedShare)} des pertes détectées y correspondent. Taux de non-appariement : ${pct(r.nonMatchRate)}. Répartition des motifs de non-appariement : ${n(reasons["no-official-record-candidates"])} changements ne recoupent aucun registre officiel; ${n(reasons["outside-temporal-tolerance"])} recoupent un registre daté hors tolérance; ${n(reasons["below-spatial-tolerance"])} recoupent des registres sur moins de la moitié; ${n(reasons["below-spatial-tolerance,outside-temporal-tolerance"])} échouent aux deux. Un changement sans registre ne prouve pas qu’il ne s’est rien passé : le registre peut manquer, ne pas être publié ou viser une terre privée. Le propriétaire a admis et diffusé cette exécution le 26 septembre 2026; aucun examen provincial externe n’a eu lieu.`;
}
