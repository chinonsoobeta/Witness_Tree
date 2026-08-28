import {
  COMPARATOR_BASELINE_YEAR,
  COMPARATOR_END_YEAR,
  COMPARATOR_PROVINCES,
} from "../../lib/phase2/annual-nfd-comparator.mjs";

const BASELINE_PROVINCE_VALUES = Object.freeze({ BC: 4, AB: 5, ON: 6, QC: 7 });

function annualRow(province, fromYear) {
  const toYear = fromYear + 1;
  const isUnknown = province === "AB" && toYear === 2001;
  const lossHectares = province === "BC" && toYear === 1985
    ? 12.5
    : province === "ON" && toYear === 2022
      ? 3.125
      : isUnknown
        ? null
        : 1.25;
  return {
    boundaryId: { BC: "59", AB: "48", ON: "35", QC: "24" }[province],
    province,
    rowType: "annual",
    baselineYear: null,
    fromYear,
    toYear,
    temporalSemantics: `${fromYear}-${toYear} adjacent annual pair`,
    knownForestedHectares: 100,
    lossHectares,
    knownObservedLossHectares: lossHectares,
    unknownRequiredInputHectares: isUnknown ? 0.5 : 0,
    observedLossOutsideFirstYearForestHectares: 0,
    coverageGrade: isUnknown ? "partial-with-unknown" : "complete",
    observedLossPercent: lossHectares === null ? null : lossHectares,
  };
}

function baselineRow(province) {
  return {
    boundaryId: { BC: "59", AB: "48", ON: "35", QC: "24" }[province],
    province,
    rowType: "baseline",
    baselineYear: COMPARATOR_BASELINE_YEAR,
    fromYear: null,
    toYear: null,
    temporalSemantics: "1984 forest-mask snapshot only; no annual loss period or loss value is assigned",
    knownForestedHectares: BASELINE_PROVINCE_VALUES[province],
    lossHectares: null,
    knownObservedLossHectares: null,
    unknownRequiredInputHectares: 0,
    observedLossOutsideFirstYearForestHectares: null,
    coverageGrade: "complete",
    observedLossPercent: null,
  };
}

function nfdRow(province, year) {
  const isUnknown = province === "QC" && year === 2001;
  const areaHectares = province === "BC" && year === 1985
    ? 100
    : province === "ON" && year === 2022
      ? 2.125
      : isUnknown
        ? null
        : 20;
  return {
    province,
    year,
    areaHectares,
    areaHectaresExact: areaHectares === null ? null : String(areaHectares),
    knownAreaHectares: areaHectares === null ? 12.5 : areaHectares,
    knownAreaHectaresExact: areaHectares === null ? "12.5" : String(areaHectares),
    sourceRowCount: 1,
    knownAreaRowCount: areaHectares === null ? 1 : 1,
    blankAreaRowCount: areaHectares === null ? 1 : 0,
    qualifierCounts: areaHectares === null ? { u: 1 } : { a: 1 },
    missingness: {
      state: isUnknown ? "partial-unknown" : "complete",
      unknownAreaRowCount: isUnknown ? 1 : 0,
      notApplicableRowCount: 0,
      unknownQualifiers: isUnknown ? ["u"] : [],
    },
    likeForLikeClaim: false,
  };
}

export function makeAnnualNfdFixture() {
  const annualRows = [];
  const nfdRows = [];
  for (const province of COMPARATOR_PROVINCES) {
    annualRows.push(baselineRow(province));
    for (let fromYear = COMPARATOR_BASELINE_YEAR; fromYear < COMPARATOR_END_YEAR; fromYear += 1) {
      annualRows.push(annualRow(province, fromYear));
    }
    for (let year = COMPARATOR_BASELINE_YEAR; year <= COMPARATOR_END_YEAR; year += 1) {
      nfdRows.push(nfdRow(province, year));
    }
  }
  return {
    annualRows,
    nfdProfile: {
      schemaVersion: "witness-tree/nonproduction-nfd-harvest-statistics-profile/1",
      frame: {
        provinces: [...COMPARATOR_PROVINCES],
        startYear: COMPARATOR_BASELINE_YEAR,
        endYear: COMPARATOR_END_YEAR,
        expectedRowCount: nfdRows.length,
        rows: nfdRows,
      },
    },
  };
}
