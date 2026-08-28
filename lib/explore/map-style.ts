export const EXPLORE_MAP_COLOURS = Object.freeze({
  ground: "#eeefe9",
  ink: "#14201a",
  observation: "#64706a",
  harvest: "#2a78d6",
  wildfire: "#eb6834",
  recovery: "#4a3aa7",
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
    en: "Statistics Canada 2021 cartographic boundaries; Natural Resources Canada VLCE2-derived Witness Tree province aggregate.",
    fr: "Limites cartographiques de 2021 de Statistique Canada; agrégat provincial de Witness Tree dérivé de VLCE2 de Ressources naturelles Canada.",
    href: "https://www150.statcan.gc.ca/n1/en/catalogue/92-160-X",
  },
  rows: [
    {
      id: "24",
      name: { en: "Quebec", fr: "Québec" },
      observedLossHectares: 680273.64,
      observedLossPercent: 0.9745108171576637,
      coverageGrade: "complete",
    },
    {
      id: "35",
      name: { en: "Ontario", fr: "Ontario" },
      observedLossHectares: 714701.7,
      observedLossPercent: 1.4436948894155726,
      coverageGrade: "complete",
    },
    {
      id: "48",
      name: { en: "Alberta", fr: "Alberta" },
      observedLossHectares: 748863.72,
      observedLossPercent: 2.8132686710314085,
      coverageGrade: "complete",
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
