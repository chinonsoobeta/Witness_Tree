export const EXPLORE_MAP_COLOURS = Object.freeze({
  ground: "#eeefe9",
  ink: "#14201a",
  observation: "#64706a",
  harvest: "#2a78d6",
  wildfire: "#eb6834",
  recovery: "#4a3aa7",
  loss0: "#e9f2e5",
  loss1: "#a9cf9b",
  loss2: "#57935a",
  loss3: "#1f5f38",
} as const);

export const EXPLORE_PRODUCTION_LAYER = Object.freeze({
  url: "https://d3g1406o0uekin.cloudfront.net/releases/phase8-province-map-v1/8809a9d577c8b615b583fc0245eb1bdb20e534a6bd86188340b7c1abac56bd96/tiles/phase2-province-loss-2020-2022.pmtiles",
  compatibilityGeoJsonUrl:
    "https://d3g1406o0uekin.cloudfront.net/releases/phase8-province-map-geojson-v2/101561ed48f511a3e65676fa084ee517c4fa722e14f4a3c844c698b247238505/map/phase2-province-loss-2020-2022.geojson",
  compatibilityGeoJsonSha256:
    "101561ed48f511a3e65676fa084ee517c4fa722e14f4a3c844c698b247238505",
  sourceLayer: "phase2_province_loss_2020_2022",
  period: "2020-2022",
  attribution: {
    en: "Statistics Canada 2021 cartographic boundaries; province aggregate derived from Natural Resources Canada VLCE2.",
    fr: "Limites cartographiques de 2021 de Statistique Canada; agrégat provincial dérivé de VLCE2 de Ressources naturelles Canada.",
    href: "https://www150.statcan.gc.ca/n1/en/catalogue/92-160-X",
  },
  /*
   * A corrected 1984-2022 execution measured the product's unmapped extent
   * inside each province. All four provinces are partial. British Columbia's
   * gap is small but non-zero: 4,095.27 hectares, or 0.00446% of the
   * cartographic province area. The other unmapped shares are 24.02% for
   * Alberta, 9.03% for Ontario and 15.05% for Quebec.
   *
   * The displayed 2020-2022 hectares and mapped-part rate are unchanged,
   * because they were always read from the mapped part alone. The measured
   * coverage fields below change the claim: each figure is a minimum rather
   * than a complete-province total. Exact execution and limitations are in
   * docs/PHASE2_MAPPED_EXTENT_COVERAGE_DEFECT.md.
   */
  rows: [
    {
      id: "24",
      name: { en: "Quebec", fr: "Québec" },
      observedLossHectares: 680273.64,
      observedLossPercent: 0.9745108171576637,
      unknownRequiredInputHectares: 22204952.19,
      unmappedByProductExtentHectares: 22204952.19,
      districtHectares: 147544902,
      unknownSharePercent: 15.049623463100067,
      coverageGrade: "partial",
    },
    {
      id: "35",
      name: { en: "Ontario", fr: "Ontario" },
      observedLossHectares: 714701.7,
      observedLossPercent: 1.4436948894155726,
      unknownRequiredInputHectares: 8843646.69,
      unmappedByProductExtentHectares: 8843646.69,
      districtHectares: 97932917.61,
      unknownSharePercent: 9.03031065123395,
      coverageGrade: "partial",
    },
    {
      id: "48",
      name: { en: "Alberta", fr: "Alberta" },
      observedLossHectares: 748863.72,
      observedLossPercent: 2.8132686710314085,
      unknownRequiredInputHectares: 15372023.76,
      unmappedByProductExtentHectares: 15372023.76,
      districtHectares: 63992872.89,
      unknownSharePercent: 24.021462181301985,
      coverageGrade: "partial",
    },
    {
      id: "59",
      name: { en: "British Columbia", fr: "Colombie-Britannique" },
      observedLossHectares: 800473.32,
      observedLossPercent: 1.3917693193039167,
      unknownRequiredInputHectares: 4095.27,
      unmappedByProductExtentHectares: 4095.27,
      districtHectares: 91730013.75,
      unknownSharePercent: 0.004464482051819162,
      coverageGrade: "partial",
    },
  ],
} as const);

/*
 * A share that rounds to zero is the one number this column must never print.
 * British Columbia's unknown area is 4,095.27 ha against 91.7 million, which at
 * two decimal places renders as "0%": a flat claim of complete coverage sitting
 * in the same sentence as the hectares that contradict it. Below the threshold
 * the label says the share is smaller than the smallest figure the column can
 * show, which is what the measurement actually supports and no more.
 *
 * Zero itself still prints as zero. A province with nothing unknown is a real
 * result, and hiding it behind a "less than" would understate the evidence.
 */
export function formatUnknownSharePercent(percent: number, locale: "en" | "fr"): string {
  const number = new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    maximumFractionDigits: 2,
  });
  const suffix = locale === "fr" ? " %" : "%";
  // The exact rounding boundary for two decimals, tested on the measured value
  // rather than on the formatted string, whose separators differ by locale.
  if (percent > 0 && percent < 0.005) return `<${number.format(0.01)}${suffix}`;
  return `${number.format(percent)}${suffix}`;
}
