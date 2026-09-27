import matchingReport from "@/data/phase4-provincial-matching-report.json";
import { formatNumber } from "../domain/number";
import { provincialCauseWholeRecord } from "./provincial-cause";

/*
 * The English methods-page text for the provincial matching results. It lives
 * in its own file because the Phase 4 publication record binds one methods-page
 * file per language. The numbers come from the run's own record, so the page
 * cannot drift from it.
 */
export function provincialMatchingTextEn(): string {
  const r = matchingReport;
  const reasons = r.nonMatchReasonDistribution;
  const n = (value: number) => formatNumber(value, "en", 0);
  const pct = (value: number) => `${formatNumber(value * 100, "en", 1)}%`;
  const cause = provincialCauseWholeRecord();
  const share = (hectares: number) => pct(hectares / cause.noNationalCauseHectares);
  return `Match rate: ${pct(r.matchRate)} of the ${n(r.counts.assessedChanges)} detected changes in British Columbia and Québec from 1985 to 2022 match an official harvest, fire, insect or windthrow record within the tolerances above; by area, ${pct(r.areaWeighted.matchedShare)} of the detected loss matches. Non-match rate: ${pct(r.nonMatchRate)}. Non-match-reason distribution: ${n(reasons["no-official-record-candidates"])} changes overlap no official record; ${n(reasons["outside-temporal-tolerance"])} overlap a record dated outside the tolerance; ${n(reasons["below-spatial-tolerance"])} overlap records by less than half; ${n(reasons["below-spatial-tolerance,outside-temporal-tolerance"])} fail on both counts. Where the national disturbance rasters record no harvest or fire, the provincial records explain part of the rest: of the ${n(cause.noNationalCauseHectares)} ha of detected loss in British Columbia and Québec with no national cause, ${share(cause.harvestHectares)} lies in changes matching a provincial harvest record, ${share(cause.fireHectares)} fire and ${share(cause.insectOrWindthrowHectares)} insects or windthrow; ${share(cause.noRecordHectares)} has no provincial record either. A change with no record is not evidence that nothing happened: a record can be missing, unpublished, or on private land. The owner admitted and released this run on 26 September 2026; no outside provincial review took place.`;
}
