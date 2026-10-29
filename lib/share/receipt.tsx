import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { colon, EVIDENCE_DEFINITIONS, PRODUCT_NAME, type Locale } from "@/lib/domain";
import { PLACE_DATA_VERSION, placePageParams, placePageRecord, type PlacePageRecord } from "@/lib/place-pages";
import { placeSummary } from "@/lib/place-pages/summary";
import { RECEIPT_SIZE } from "./meta";

export { RECEIPT_CONTENT_TYPE, RECEIPT_SIZE, receiptAlt, receiptPath } from "./meta";

/**
 * A place's share card: one 1200 by 630 image that carries its own caveats, so
 * a social preview or a screenshot travels with the figure's coverage, years,
 * boundary edition, data version, evidence class and licence (plan section
 * 9.3). Every word comes from the same summary the place page prints, so an
 * Unknown reads as the page's reasoned Unknown statement, never as 0 or blank.
 *
 * The card is rendered by next/og (Satori and resvg, no other dependency) in
 * BC Sans, read from the licensed @bcgov/bc-sans package, which ships the WOFF
 * files Satori reads (it cannot read WOFF2). The same record and locale always
 * give the same bytes: scripts/check-share-images.mjs holds a sample to
 * checked-in SHA-256 digests.
 */


/**
 * The light palette's tokens from app/globals.css, which an image cannot read
 * as CSS variables. tests/share-receipt.test.tsx fails if they drift.
 */
export const RECEIPT_TOKENS = {
  ground: "#fdfcf8",
  surface2: "#f0ebe5",
  ink: "#2c2c24",
  ink2: "#4a4a40",
  muted: "#615f54",
  rule: "#ded8cf",
  accent: "#47593f",
  heroFill: "#47593f",
  heroInk: "#fdfcf8",
  tintSatellite: "#dbe6f4",
  edgeSatellite: "#3f6ea8",
  tintUnknown: "#e4e8e5",
  edgeUnknown: "#6b7670",
} as const;

const COPY = {
  en: {
    years: "Years",
    span: "1984–2022",
    coverage: "Coverage",
    unmapped: "Unmapped share",
    edition: "Boundary edition",
    dataVersion: "Data version",
    evidence: "Evidence",
    share: "of the forest mapped in 1984",
    shareUnknown: "Share Unknown",
    minimum: "A minimum: only the part of the forest with satellite data is counted.",
    licence: "Contains information licensed under the Open Government Licence – Canada (Natural Resources Canada, VLCE2). No endorsement is implied.",
    preview: "Preview figures: not expert reviewed, not a formal release.",
  },
  // French strings are Claude's drafts awaiting the owner's review (2026-10-29).
  fr: {
    years: "Années",
    span: "1984–2022",
    coverage: "Couverture",
    unmapped: "Part non cartographiée",
    edition: "Édition de la limite",
    dataVersion: "Version des données",
    evidence: "Preuve",
    share: "de la forêt cartographiée en 1984",
    shareUnknown: "Part inconnue",
    minimum: "Un minimum\u202F: seule la partie de la forêt couverte par des données satellitaires est comptée.",
    licence: "Contient de l’information visée par la Licence du gouvernement ouvert – Canada (Ressources naturelles Canada, VLCE2). Aucune approbation n’est sous-entendue.",
    preview: "Chiffres préliminaires\u202F: non examinés par des experts, pas une publication officielle.",
  },
} as const;

let fonts: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | undefined;

function receiptFonts() {
  if (!fonts) {
    const directory = path.join(process.cwd(), "node_modules", "@bcgov", "bc-sans", "fonts");
    fonts = [
      { name: "BC Sans", data: readFileSync(path.join(directory, "BCSans-Regular.woff")), weight: 400, style: "normal" },
      { name: "BC Sans", data: readFileSync(path.join(directory, "BCSans-Bold.woff")), weight: 700, style: "normal" },
    ];
  }
  return fonts;
}

function nameSize(name: string) {
  if (name.length > 56) return 40;
  if (name.length > 40) return 48;
  if (name.length > 26) return 56;
  return 64;
}

function Fact({ label, value, locale }: Readonly<{ label: string; value: string; locale: Locale }>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 20 }}>
      <div style={{ fontSize: 15, color: RECEIPT_TOKENS.muted }}>{`${label}${colon(locale)}`}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: RECEIPT_TOKENS.ink }}>{value}</div>
    </div>
  );
}

/** The card's layout, for ImageResponse. */
export function ReceiptCard({ record, locale }: Readonly<{ record: PlacePageRecord; locale: Locale }>) {
  const text = COPY[locale];
  const summary = placeSummary(record, locale);
  const { figures } = summary;
  const unknown = figures.lost.kind === "unknown";
  const evidence = EVIDENCE_DEFINITIONS[figures.lost.evidence].label[locale];
  const edge = unknown ? RECEIPT_TOKENS.edgeUnknown : RECEIPT_TOKENS.edgeSatellite;
  const tint = unknown ? RECEIPT_TOKENS.tintUnknown : RECEIPT_TOKENS.tintSatellite;
  const shareLine = figures.share.kind === "figure" ? `${summary.share} ${text.share}` : `${text.shareUnknown}${colon(locale)} ${figures.share.reason[locale]}`;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: RECEIPT_TOKENS.ground, color: RECEIPT_TOKENS.ink, fontFamily: "BC Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: RECEIPT_TOKENS.heroFill, color: RECEIPT_TOKENS.heroInk, padding: "14px 56px", fontSize: 21 }}>
        <div style={{ fontWeight: 700 }}>{PRODUCT_NAME[locale]}</div>
        <div>{`${record.typeLabel[locale]} · ${summary.province}`}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "22px 56px 0" }}>
        <div style={{ fontSize: nameSize(summary.name), fontWeight: 700, lineHeight: 1.1 }}>{summary.name}</div>
        <div style={{ fontSize: 21, color: RECEIPT_TOKENS.ink2, marginTop: 10 }}>{summary.lostLabel}</div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 8, borderLeft: `8px solid ${edge}`, background: tint, padding: "12px 22px" }}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.05 }}>{unknown ? `– ${summary.lost}` : summary.lost}</div>
          <div style={{ fontSize: 22, marginTop: 6, lineHeight: 1.3 }}>{figures.lost.kind === "unknown" ? figures.lost.reason[locale] : shareLine}</div>
          {figures.lostIsMinimum ? <div style={{ fontSize: 18, marginTop: 4, color: RECEIPT_TOKENS.ink2 }}>{text.minimum}</div> : null}
        </div>

        <div style={{ fontSize: 19, marginTop: 12, color: RECEIPT_TOKENS.ink }}>{`${text.coverage}${colon(locale)} ${summary.coverage}`}</div>

        <div style={{ display: "flex", flexWrap: "wrap", marginTop: "auto", paddingTop: 10, paddingBottom: 10, borderTop: `1px solid ${RECEIPT_TOKENS.rule}` }}>
          <Fact label={text.years} value={text.span} locale={locale} />
          <Fact label={text.unmapped} value={summary.unmapped} locale={locale} />
          <Fact label={text.edition} value={record.boundary.edition} locale={locale} />
          <Fact label={text.dataVersion} value={PLACE_DATA_VERSION} locale={locale} />
          <Fact label={text.evidence} value={evidence} locale={locale} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", background: RECEIPT_TOKENS.surface2, padding: "10px 56px", fontSize: 15, lineHeight: 1.35, color: RECEIPT_TOKENS.ink2 }}>
        <div>{`${text.licence} ${text.preview}`}</div>
      </div>
    </div>
  );
}

/** The card as a PNG response. */
export function renderReceipt(record: PlacePageRecord, locale: Locale): ImageResponse {
  return new ImageResponse(<ReceiptCard record={record} locale={locale} />, { ...RECEIPT_SIZE, fonts: receiptFonts() });
}

type PlaceParams = Readonly<{ dataVersion: string; geography: string; code: string }>;

/** Every place that has a page has a card, and no other. */
export function receiptStaticParams() {
  return placePageParams().map(({ dataVersion, geography, code }) => ({ dataVersion, geography, code }));
}

export async function receiptImage(locale: Locale, params: Promise<PlaceParams>) {
  const { dataVersion, geography, code } = await params;
  const record = placePageRecord(dataVersion, geography, decodeURIComponent(code));
  if (!record) throw new Error(`No place page for ${dataVersion}/${geography}/${code}.`);
  return renderReceipt(record, locale);
}

/** Renders the given characters in both weights, so scripts/check-share-images.mjs can prove BC Sans covers every card. */
export function renderGlyphSample(text: string): Promise<ArrayBuffer> {
  const line = (weight: 400 | 700) => <div style={{ display: "flex", flexWrap: "wrap", fontWeight: weight, fontSize: 20 }}>{text}</div>;
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "BC Sans" }}>{line(400)}{line(700)}</div>,
    { ...RECEIPT_SIZE, fonts: receiptFonts() },
  ).arrayBuffer();
}
