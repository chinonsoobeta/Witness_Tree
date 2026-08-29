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
   * The coverage grade says whether the province was measured end to end, and
   * for three of these four it is not "complete".
   *
   * The land cover source writes 0 outside the extent it maps, and the derived
   * forest masks cannot tell that apart from a mapped cell holding no forest,
   * so the aggregate that produced these rows counted unmapped ground as
   * measured and forest-free. Sampling the 2020 source inside districts these
   * provinces contain settles it: Ajax reads 100% unmapped, Huntingdon 100%,
   * Calgary-Acadia 100%, Stormont-Dundas-South Glengarry 99.98%, Granby 98.92%.
   * British Columbia is left complete because nothing here shows otherwise:
   * its two treeless districts sampled as fully mapped, and an unevidenced
   * downgrade would be as much an invention as the overstatement it replaced.
   *
   * The hectares and the rate are unchanged, because they were always read
   * from the mapped part alone. What changes is the claim made about them: a
   * partial grade renders as a minimum rather than as a complete measurement,
   * which is what these three are. The exact unmapped area per province
   * replaces this sampling once the corrected aggregate has been run; see
   * docs/PHASE2_MAPPED_EXTENT_COVERAGE_DEFECT.md.
   */
  rows: [
    {
      id: "24",
      name: { en: "Quebec", fr: "Québec" },
      observedLossHectares: 680273.64,
      observedLossPercent: 0.9745108171576637,
      coverageGrade: "partial",
    },
    {
      id: "35",
      name: { en: "Ontario", fr: "Ontario" },
      observedLossHectares: 714701.7,
      observedLossPercent: 1.4436948894155726,
      coverageGrade: "partial",
    },
    {
      id: "48",
      name: { en: "Alberta", fr: "Alberta" },
      observedLossHectares: 748863.72,
      observedLossPercent: 2.8132686710314085,
      coverageGrade: "partial",
    },
    {
      id: "59",
      name: { en: "British Columbia", fr: "Colombie-Britannique" },
      observedLossHectares: 800473.32,
      observedLossPercent: 1.3917693193039167,
      coverageGrade: "complete",
    },
  ],
} as const);
