import type { Locale } from "@/lib/domain";

/**
 * PROTOTYPE: a tilted view of one place, with the loss patches draped over a
 * ground model. Not released, not an admitted source, not production eligible.
 *
 * The view exists only when the build sets NEXT_PUBLIC_TERRAIN_PROTOTYPE=1 and
 * only for the places listed here. The elevation archive is built locally by
 * scripts/terrain_prototype/build_terrain_tiles.py and is not checked in.
 *
 * The elevation is Natural Resources Canada's MRDEM-30 digital terrain model
 * (CanElevation Series, product specifications edition 1.2, 2025-06-20), under
 * the Open Government Licence - Canada. Part of it was produced from the
 * Copernicus WorldDEM-30, whose licence requires the notice and the liability
 * sentence carried in the attribution below whenever the data is shown to the
 * public. See docs/TERRAIN_PROTOTYPE.md.
 */

export type TerrainPrototype = Readonly<{
  /** The elevation archive, as an address on this site. */
  url: string;
  /** The box the archive covers; the camera stays inside it. */
  bounds: readonly [west: number, south: number, east: number, north: number];
  minZoom: number;
  maxZoom: number;
  tileSize: number;
  /** The compass direction the view first looks toward, in degrees. */
  bearing: number;
}>;

const PROTOTYPES: Readonly<Record<string, TerrainPrototype>> = {
  // Squamish, British Columbia.
  "csd-2021/5931006": {
    url: "/prototype/terrain/squamish-dtm.pmtiles",
    bounds: [-123.75, 49.382373, -122.34375, 50.289339],
    minZoom: 9,
    maxZoom: 11,
    tileSize: 512,
    bearing: 10,
  },
};

export function terrainPrototype(geography: string, code: string): TerrainPrototype | null {
  if (process.env.NEXT_PUBLIC_TERRAIN_PROTOTYPE !== "1") return null;
  return PROTOTYPES[`${geography}/${code}`] ?? null;
}

export const TERRAIN_COPY: Readonly<Record<Locale, {
  heading: string;
  prototype: string;
  label: (name: string) => string;
  key: string;
  says: string;
  turnLeft: string;
  turnRight: string;
  flat: string;
  tilted: string;
  reset: string;
  showLoss: string;
  hint: string;
  failed: string;
  attribution: string;
}>> = {
  en: {
    heading: "The land in three dimensions",
    prototype: "Prototype",
    label: (name) => `A tilted map of ${name} showing the shape of the land, with forest loss drawn on it`,
    key: "Forest detected as lost at least once, 1984–2022, from any cause",
    says: "The ground is a 30 m model of bare land, shown at true height with no exaggeration. It shows the shape of the land, not trees: where a patch is drawn the forest was lost at least once, and some of it has grown back since.",
    turnLeft: "Turn left",
    turnRight: "Turn right",
    flat: "Look straight down",
    tilted: "Tilt the view",
    reset: "Reset the view",
    showLoss: "Show forest loss",
    hint: "Drag to move. Hold Control and drag, or drag with two fingers, to turn and tilt.",
    failed: "The three-dimensional view could not be drawn.",
    attribution:
      "Elevation: Natural Resources Canada, Medium Resolution Digital Elevation Model (MRDEM-30), CanElevation Series. Contains information licensed under the Open Government Licence – Canada. Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30.",
  },
  // Draft French, not reviewed.
  fr: {
    heading: "Le terrain en trois dimensions",
    prototype: "Prototype",
    label: (name) => `Une carte inclinée de ${name} montrant le relief, avec les pertes de forêt dessinées dessus`,
    key: "Forêt détectée comme perdue au moins une fois, 1984–2022, toutes causes confondues",
    says: "Le sol est un modèle du terrain nu à 30 m, montré à sa hauteur réelle, sans exagération. Il montre le relief, pas les arbres : là où une parcelle est dessinée, la forêt a été perdue au moins une fois, et une partie a repoussé depuis.",
    turnLeft: "Tourner à gauche",
    turnRight: "Tourner à droite",
    flat: "Regarder à la verticale",
    tilted: "Incliner la vue",
    reset: "Réinitialiser la vue",
    showLoss: "Afficher les pertes de forêt",
    hint: "Faites glisser pour déplacer. Maintenez Contrôle et faites glisser, ou faites glisser avec deux doigts, pour tourner et incliner.",
    failed: "La vue en trois dimensions n’a pas pu être dessinée.",
    attribution:
      "Altitude : Ressources naturelles Canada, Modèle numérique d’élévation de moyenne résolution (MNEMR-30), série CanElevation. Contient de l’information visée par la Licence du gouvernement ouvert – Canada. Produit à l’aide de Copernicus WorldDEM-30 © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni dans le cadre de COPERNICUS par l’Union européenne et l’ESA ; tous droits réservés. Les organisations responsables du programme Copernicus, en vertu de la loi ou par délégation, n’assument aucune responsabilité quant à l’utilisation de Copernicus WorldDEM-30.",
  },
};
