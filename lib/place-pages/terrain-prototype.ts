import type { Locale } from "@/lib/domain";

/**
 * PROTOTYPE: a tilted view of one place, with the loss patches draped over the
 * land. Not released, not an admitted source, not production eligible.
 *
 * The view exists only when the build sets NEXT_PUBLIC_TERRAIN_PROTOTYPE=1 and
 * only for the places listed here. The archives are built locally by
 * scripts/terrain_prototype/ and are not checked in.
 *
 * Far land is Natural Resources Canada's MRDEM-30 digital terrain model
 * (CanElevation Series), under the Open Government Licence - Canada. Part of it
 * was produced from the Copernicus WorldDEM-30, whose licence requires the
 * notice and the liability sentence carried in the attribution below whenever
 * the data is shown to the public.
 *
 * The close-up area in the middle of the place uses three finer sources: the
 * 1 m HRDEM Mosaic's surface model (treetops and roofs) and terrain model
 * (bare ground), same publisher and licence; and the District of Squamish's
 * 2024 air photo, under the Open Government Licence - Squamish. Photographs
 * taken at ground level come from two open archives, Panoramax and KartaView,
 * under CC BY-SA 4.0, and are shown only where a contributor took one. See
 * docs/TERRAIN_PROTOTYPE.md.
 */

/** Height above ground, in classes. The colours are the ones the height tiles were built with. */
export const TERRAIN_HEIGHT_CLASSES = [
  { from: 2, to: 10, colour: "#e2ecbc" },
  { from: 10, to: 20, colour: "#9ec872" },
  { from: 20, to: 30, colour: "#62a352" },
  { from: 30, to: 40, colour: "#30783f" },
  { from: 40, to: null, colour: "#134f32" },
] as const;

/** Colours the view draws with that are not Explore's: the lit side of a slope, and the sky. */
export const TERRAIN_COLOURS = {
  highlight: "#ffffff",
  sky: "#cfd9d6",
  horizon: "#e6e9e2",
  /** A place with a ground-level photo, and the ring round each dot. */
  groundPhoto: "#a3246f",
  groundPhotoEdge: "#ffffff",
} as const;

export type TerrainPrototype = Readonly<{
  /** The 30 m ground model alone, as an address on this site. It shades the land at every zoom. */
  far: string;
  /** Elevation with treetops and roofs in the close-up area. */
  surface: string;
  /** Elevation of bare ground everywhere. */
  ground: string;
  /** The box the far elevation covers; the camera stays inside it. */
  bounds: readonly [west: number, south: number, east: number, north: number];
  minZoom: number;
  /** How far in the camera can go. */
  maxZoom: number;
  tileSize: number;
  /** The compass direction the view first looks toward, in degrees. */
  bearing: number;
  closeUp: Readonly<{
    /** The box the finer sources cover. */
    bounds: readonly [west: number, south: number, east: number, north: number];
    /** Where "Go to the close-up" lands. */
    view: Readonly<{ center: readonly [number, number]; zoom: number; bearing: number; pitch: number }>;
    /** The air photo over the whole close-up area. */
    photo: string;
    /** The air photo's finest level, which exists only inside a smaller box. */
    photoCore: Readonly<{ url: string; bounds: readonly [west: number, south: number, east: number, north: number]; zoom: number }>;
    height: string;
    /** The folder holding the ground-level photos and their index, ending with a slash. */
    groundPhotos: string;
  }>;
}>;

const PROTOTYPES: Readonly<Record<string, TerrainPrototype>> = {
  // Squamish, British Columbia.
  "csd-2021/5931006": {
    far: "/prototype/terrain/squamish-dtm.pmtiles",
    surface: "/prototype/terrain/squamish-surface.pmtiles",
    ground: "/prototype/terrain/squamish-ground.pmtiles",
    bounds: [-123.75, 49.382373, -122.34375, 50.289339],
    minZoom: 9,
    // At zoom 20 the finest photo tiles are drawn one pixel for one pixel. Any closer only enlarges them.
    maxZoom: 20,
    tileSize: 512,
    bearing: 10,
    closeUp: {
      bounds: [-123.200684, 49.667628, -123.112793, 49.738682],
      // From above downtown, looking south-east to the Stawamus Chief.
      view: { center: [-123.1485, 49.6915], zoom: 15.4, bearing: 140, pitch: 68 },
      photo: "/prototype/terrain/squamish-photo-2024.pmtiles",
      photoCore: { url: "/prototype/terrain/squamish-photo-2024-core.pmtiles", bounds: [-123.178711, 49.681847, -123.134766, 49.724479], zoom: 21 },
      height: "/prototype/terrain/squamish-height.pmtiles",
      groundPhotos: "/prototype/terrain/ground/",
    },
  },
};

/**
 * A link that opens Google's own street-level photos nearest a spot, looking a
 * given compass direction. It is Google's documented "Maps URL", which needs no
 * key and costs nothing. Nothing of Google's is loaded, shown or kept by this
 * Site: the link leaves it.
 */
export function streetViewLink(longitude: number, latitude: number, bearing: number): string {
  const heading = ((Math.round(bearing) % 360) + 360) % 360;
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude.toFixed(6)}%2C${longitude.toFixed(6)}&heading=${heading}`;
}

export function terrainPrototype(geography: string, code: string): TerrainPrototype | null {
  if (process.env.NEXT_PUBLIC_TERRAIN_PROTOTYPE !== "1") return null;
  return PROTOTYPES[`${geography}/${code}`] ?? null;
}

/** The view's wording as plain text: a function cannot be handed to a browser component. */
export function terrainText(locale: Locale, name: string) {
  const { label, heightRange, ...rest } = TERRAIN_COPY[locale];
  return {
    text: { ...rest, label: label(name) },
    /** The height key, lowest class first, each with its colour and its wording. */
    heights: TERRAIN_HEIGHT_CLASSES.map((entry) => ({ colour: entry.colour, label: heightRange(entry.from, entry.to) })),
  };
}

export const TERRAIN_COPY: Readonly<Record<Locale, {
  heading: string;
  prototype: string;
  label: (name: string) => string;
  key: string;
  says: string;
  closeUpSays: string;
  turnLeft: string;
  turnRight: string;
  flat: string;
  tilted: string;
  reset: string;
  closeUp: string;
  zoomIn: string;
  zoomOut: string;
  surfaceGroup: string;
  surface: string;
  ground: string;
  layersGroup: string;
  showPhoto: string;
  showHeight: string;
  showLoss: string;
  showGround: string;
  streetView: string;
  streetViewNote: string;
  groundOpen: string;
  groundKey: string;
  groundSays: string;
  groundLabel: string;
  groundPosition: string;
  groundTaken: string;
  groundSphere: string;
  groundFlat: string;
  groundLoading: string;
  groundFailed: string;
  groundPrevious: string;
  groundNext: string;
  groundClose: string;
  groundLeft: string;
  groundRight: string;
  groundUp: string;
  groundDown: string;
  groundCloser: string;
  groundWider: string;
  groundLicence: string;
  heightKey: string;
  heightRange: (from: number, to: number | null) => string;
  heightNote: string;
  closeUpArea: string;
  hint: string;
  failed: string;
  attribution: string;
}>> = {
  en: {
    heading: "The land in three dimensions",
    prototype: "Prototype",
    label: (name) => `A tilted map of ${name} showing the shape of the land, with forest loss drawn on it`,
    key: "Forest detected as lost at least once, 1984–2022, from any cause",
    says: "The land is shown at true height with no exaggeration. Where a patch is drawn the forest was lost at least once, and some of it has grown back since. The patches come from 30 m satellite cells, so they stay blocky however far in you go.",
    closeUpSays: "Inside the dashed box, the middle of Squamish, the view is much finer: a 1 m laser survey of the ground and of the treetops and roofs above it, with the District of Squamish’s 2024 air photo laid over it at about 10 cm, and at about 5 cm, the photo’s own detail, in the middle of the box. You can pick out single trees, road markings and garden beds there. The survey’s flight year is not established and it is older than the photo, so a tree in the photo may stand where the surface is bare, and the reverse. Outside the box, and where no survey flight passed, the ground is a 30 m model with no photo.",
    turnLeft: "Turn left",
    turnRight: "Turn right",
    flat: "Look straight down",
    tilted: "Tilt the view",
    reset: "Whole place",
    closeUp: "Go to the close-up",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    surfaceGroup: "Shape of the land",
    surface: "Treetops and roofs",
    ground: "Bare ground",
    layersGroup: "Drawn on the land",
    showPhoto: "Air photo, 2024",
    showHeight: "Height above ground",
    showLoss: "Forest loss",
    showGround: "Ground-level photos",
    streetView: "Open this spot in Google Street View",
    streetViewNote: "This link leaves the Site for Google Maps and opens Google’s own street-level photos nearest the middle of the map above, facing the way the map faces. Google has them along roads and a few trails, not through the forest. They belong to Google; nothing of them is shown or kept here.",
    groundOpen: "See photos from the ground",
    groundKey: "A photo taken at ground level",
    groundSays: "Each dot is a photograph someone took there and gave to an open archive. A few are all-round photos taken at one spot under the trees beside a creek, and come close to a street-level photo service in sharpness. The rest are single frames from volunteers’ drives along roads; they are less sharp and some are years old, and each shows its date. There are photos only where a volunteer went, and almost none in the forest. Nothing between the dots is filled in.",
    groundLabel: "A photograph taken at ground level in Squamish",
    groundPosition: "Photo {n} of {count}",
    groundTaken: "Taken on {date}. Credit: {by}. Shared through {archive}.",
    groundSphere: "This is a photo of everything around the camera. Drag it, or use the buttons, to look around.",
    groundFlat: "This is a single photo looking one way.",
    groundLoading: "Loading the photo…",
    groundFailed: "The photo could not be loaded.",
    groundPrevious: "Previous photo",
    groundNext: "Next photo",
    groundClose: "Close the photo",
    groundLeft: "Look left",
    groundRight: "Look right",
    groundUp: "Look up",
    groundDown: "Look down",
    groundCloser: "Look closer",
    groundWider: "Look wider",
    groundLicence: "Licence: CC BY-SA 4.0. Shown resized and otherwise unchanged. The archive blurred faces and number plates before sharing it.",
    heightKey: "Height above ground, from the laser survey",
    heightRange: (from, to) => (to === null ? `${from} m or more` : `${from} to ${to} m`),
    heightNote: "Trees and buildings alike. Under 2 m is left uncoloured.",
    closeUpArea: "Close-up area",
    hint: "Drag to move. Hold Control and drag, or drag with two fingers, to turn and tilt.",
    failed: "The three-dimensional view could not be drawn.",
    attribution:
      "Elevation: Natural Resources Canada, Medium Resolution Digital Elevation Model (MRDEM-30) and High Resolution Digital Elevation Model Mosaic (HRDEM Mosaic), CanElevation Series. Contains information licensed under the Open Government Licence – Canada. Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30. Air photo: District of Squamish, Aerial Photo 2024. Contains information licensed under the Open Government Licence – Squamish. Ground-level photos: Panoramax contributors, each named with their photo, and © Grab and KartaView Contributors, under CC BY-SA 4.0.",
  },
  // Draft French, not reviewed.
  fr: {
    heading: "Le terrain en trois dimensions",
    prototype: "Prototype",
    label: (name) => `Une carte inclinée de ${name} montrant le relief, avec les pertes de forêt dessinées dessus`,
    key: "Forêt détectée comme perdue au moins une fois, 1984–2022, toutes causes confondues",
    says: "Le terrain est montré à sa hauteur réelle, sans exagération. Là où une parcelle est dessinée, la forêt a été perdue au moins une fois, et une partie a repoussé depuis. Les parcelles viennent de cellules satellitaires de 30 m : elles restent en blocs, aussi près que l’on s’approche.",
    closeUpSays: "Dans le cadre en pointillé, au centre de Squamish, la vue est beaucoup plus fine : un levé laser à 1 m du sol, et de la cime des arbres et des toits au-dessus, recouvert de la photo aérienne de 2024 du District de Squamish à environ 10 cm, et à environ 5 cm, le détail propre à la photo, au milieu du cadre. On y distingue les arbres un à un, le marquage des routes et les plates-bandes. L’année de vol du levé n’est pas établie et il est plus ancien que la photo : un arbre de la photo peut se trouver là où la surface est nue, et l’inverse. Hors du cadre, et là où aucun vol n’est passé, le sol est un modèle à 30 m, sans photo.",
    turnLeft: "Tourner à gauche",
    turnRight: "Tourner à droite",
    flat: "Regarder à la verticale",
    tilted: "Incliner la vue",
    reset: "Tout le lieu",
    closeUp: "Aller au gros plan",
    zoomIn: "Zoom avant",
    zoomOut: "Zoom arrière",
    surfaceGroup: "Forme du terrain",
    surface: "Cime des arbres et toits",
    ground: "Sol nu",
    layersGroup: "Dessiné sur le terrain",
    showPhoto: "Photo aérienne, 2024",
    showHeight: "Hauteur au-dessus du sol",
    showLoss: "Pertes de forêt",
    showGround: "Photos prises au sol",
    streetView: "Ouvrir cet endroit dans Google Street View",
    streetViewNote: "Ce lien quitte le Site pour Google Maps et ouvre les photos de rue de Google les plus proches du centre de la carte ci-dessus, tournées comme la carte. Google en a le long des routes et de quelques sentiers, pas à travers la forêt. Elles appartiennent à Google ; rien n’en est montré ni conservé ici.",
    groundOpen: "Voir les photos prises au sol",
    groundKey: "Une photo prise au sol",
    groundSays: "Chaque point est une photographie que quelqu’un a prise sur place et versée dans une archive ouverte. Quelques-unes sont des photos à 360 degrés prises au même endroit, sous les arbres au bord d’un ruisseau, et leur netteté approche celle d’un service de photos de rue. Les autres sont des images isolées tirées de trajets de bénévoles le long des routes ; elles sont moins nettes et certaines datent de plusieurs années, et chacune indique sa date. Il n’y a de photos que là où un bénévole est passé, et presque aucune en forêt. Rien n’est inventé entre les points.",
    groundLabel: "Une photographie prise au sol à Squamish",
    groundPosition: "Photo {n} sur {count}",
    groundTaken: "Prise le {date}. Crédit : {by}. Partagée par {archive}.",
    groundSphere: "Cette photo montre tout ce qui entoure l’appareil. Faites-la glisser, ou utilisez les boutons, pour regarder autour.",
    groundFlat: "Cette photo regarde dans une seule direction.",
    groundLoading: "Chargement de la photo…",
    groundFailed: "La photo n’a pas pu être chargée.",
    groundPrevious: "Photo précédente",
    groundNext: "Photo suivante",
    groundClose: "Fermer la photo",
    groundLeft: "Regarder à gauche",
    groundRight: "Regarder à droite",
    groundUp: "Regarder en haut",
    groundDown: "Regarder en bas",
    groundCloser: "Regarder de plus près",
    groundWider: "Élargir la vue",
    groundLicence: "Licence : CC BY-SA 4.0. Montrée redimensionnée, sans autre changement. L’archive a flouté les visages et les plaques avant de la partager.",
    heightKey: "Hauteur au-dessus du sol, d’après le levé laser",
    heightRange: (from, to) => (to === null ? `${from} m ou plus` : `${from} à ${to} m`),
    heightNote: "Arbres et bâtiments confondus. Moins de 2 m : sans couleur.",
    closeUpArea: "Zone du gros plan",
    hint: "Faites glisser pour déplacer. Maintenez Contrôle et faites glisser, ou faites glisser avec deux doigts, pour tourner et incliner.",
    failed: "La vue en trois dimensions n’a pas pu être dessinée.",
    attribution:
      "Altitude : Ressources naturelles Canada, Modèle numérique d’élévation de moyenne résolution (MNEMR-30) et Mosaïque du Modèle numérique d’élévation de haute résolution (mosaïque MNEHR), série CanElevation. Contient de l’information visée par la Licence du gouvernement ouvert – Canada. Produit à l’aide de Copernicus WorldDEM-30 © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni dans le cadre de COPERNICUS par l’Union européenne et l’ESA ; tous droits réservés. Les organisations responsables du programme Copernicus, en vertu de la loi ou par délégation, n’assument aucune responsabilité quant à l’utilisation de Copernicus WorldDEM-30. Photo aérienne : District de Squamish, Aerial Photo 2024. Contient de l’information visée par l’Open Government Licence – Squamish. Photos prises au sol : contributeurs de Panoramax, chacun nommé avec sa photo, et © Grab and KartaView Contributors, sous licence CC BY-SA 4.0.",
  },
};
