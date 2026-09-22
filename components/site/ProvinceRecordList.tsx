"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  EVIDENCE_DEFINITIONS,
  formatHectares,
  formatNumber,
  formatPercent,
  type Locale,
} from "@/lib/domain";
import { formatUnknownSharePercent, type ProvinceSpanMeasurement } from "@/lib/explore";
import { provinceSpanReach } from "@/lib/explore/period";

/*
 * One list, two measures, one bar each.
 *
 * The four provinces used to be a two-column grid of cards, which is a layout
 * for browsing and these are not things to browse: they are four readings of
 * the same instrument, and a reader wants them ranked. A list ranks. Cards
 * only sit beside each other.
 *
 * The second measure is the reason the toggle exists. The unmapped share was
 * a clause inside the loss card's caveat sentence, which is the smallest and
 * least readable place on the card for the number that decides whether the
 * figure above it is a total or a floor. It is a measure in its own right
 * now, with its own ranking, because it answers a different question.
 *
 * What did not come back is a shared scale that needs a sentence to explain
 * it. Each measure draws exactly what its own figure says: the loss bar is
 * hectares against the largest of the four, and the coverage bar is one whole
 * province split into what the source mapped and what it did not. Neither
 * needs a disclaimer, and a drawing that needs one is the wrong drawing.
 */

type Row = ProvinceSpanMeasurement;
type Measure = "loss" | "cover";

// Detected loss only. The unmapped hectares are deliberately not in this
// maximum: the two measures never share a scale again.
const scaleHectares = (rows: readonly Row[]) => Math.max(
  ...rows.flatMap((row) => row.unionLossHectares === null ? [] : [row.unionLossHectares]),
);

const COPY = {
  en: {
    group: "Choose what to read",
    loss: "Forest lost",
    cover: "Area not checked",
    lossHeadline: "How much forest was detected as lost",
    coverHeadline: "How much of each province could not be checked",
    keyMapped: "Mapped by the source",
    keyUnmapped: "Never mapped, and therefore Unknown",
    keyLabel: "What the coverage bar shows",
    recorded: "ha recorded",
    measured: "ha unmapped",
    sources: "Source and limits",
    basis: "of the forest the source mapped. A minimum, because",
    basisEnd:
      "of the province was never mapped, and unmapped is never counted as zero.",
    coverNote: "was never mapped by the source, so nothing in it was checked.",
    coverEnd: "An unmapped area is Unknown. It is not a zero.",
    charLead: "Here that gap is",
  },
  fr: {
    group: "Choisir ce qui est affiché",
    loss: "Pertes forestières",
    cover: "Superficie non vérifiée",
    lossHeadline: "Quelle superficie forestière a été détectée comme perdue",
    coverHeadline: "Quelle part de chaque province n’a pas pu être vérifiée",
    keyMapped: "Cartographié par la source",
    keyUnmapped: "Jamais cartographié, donc Inconnu",
    keyLabel: "Ce que montre la barre de couverture",
    recorded: "ha consignés",
    measured: "ha non cartographiés",
    sources: "Source et limites",
    basis: "de la forêt cartographiée par la source. Un minimum, car",
    basisEnd:
      "de la province n’a jamais été cartographiée, et une zone non cartographiée n’est jamais comptée comme zéro.",
    coverNote: "n’a jamais été cartographié par la source, donc rien n’y a été vérifié.",
    coverEnd: "Une zone non cartographiée est Inconnue. Ce n’est pas un zéro.",
    charLead: "Ici, il s’agit d’un",
  },
} as const;

export function ProvinceRecordList({ rows, locale, unknownContexts }: Readonly<{
  rows: readonly Row[];
  locale: Locale;
  /**
   * The page keeps ownership of how an unmapped province is characterised.
   * Read out for assistive technology, keyed by the row it belongs to.
   */
  unknownContexts: Readonly<Record<string, string>>;
}>) {
  const [measure, setMeasure] = useState<Measure>("loss");
  const headlineId = useId();
  const copy = COPY[locale];
  const span = provinceSpanReach(locale);
  const lossScale = scaleHectares(rows);
  const showingLoss = measure === "loss";

  // Each measure ranks on its own figure. Sorting on one and printing the
  // other is how a list implies an order its numbers do not support.
  const ordered = [...rows].sort((a, b) => showingLoss
    ? (b.unionLossHectares ?? -Infinity) - (a.unionLossHectares ?? -Infinity)
    : b.unknownSharePercent - a.unknownSharePercent);

  return (
    <div className="province-list-block">
      <div className="province-list-head">
        <p className="province-list-headline" id={headlineId}>
          {showingLoss ? copy.lossHeadline : copy.coverHeadline}
        </p>
        <div className="measure-toggle" role="group" aria-label={copy.group}>
          <button
            type="button"
            className="measure-toggle-option"
            aria-pressed={showingLoss}
            onClick={() => setMeasure("loss")}
          >
            {copy.loss}
          </button>
          <button
            type="button"
            className="measure-toggle-option"
            aria-pressed={!showingLoss}
            onClick={() => setMeasure("cover")}
          >
            {copy.cover}
          </button>
        </div>
      </div>

      {/*
        A key, not a disclaimer. It names the two parts of a bar the reader can
        see; it does not ask the reader to discount what the bar draws.
      */}
      {showingLoss ? null : (
        <ul className="province-list-key" aria-label={copy.keyLabel}>
          <li><span className="province-list-key-mapped" aria-hidden="true" />{copy.keyMapped}</li>
          <li><span className="province-list-key-gap" aria-hidden="true" />{copy.keyUnmapped}</li>
        </ul>
      )}

      <ol className="province-list" aria-labelledby={headlineId}>
        {ordered.map((row) => {
          const unknownShare = row.unknownHectares === null
            ? "Unknown"
            : formatUnknownSharePercent(row.unknownSharePercent, locale);
          const mappedShare = row.unknownHectares === null ? null : 100 - row.unknownSharePercent;
          /*
           * The qualifier rides on both measures, not only on the one that
           * ranks by coverage. It is what stops a reader treating British
           * Columbia's gap as unmeasured forest, and a claim that only
           * appears once a control has been pressed is a claim most readers
           * never see.
           */
          const character = ` ${copy.charLead} ${row.unmappedCharacter[locale]}.`;
          return (
            <li className="province-list-row" key={row.id}>
              {/*
                The evidence class, the place and the figure share one baseline.
                Stacked, the row ran to 352px and four of them pushed the fourth
                province below the fold on a laptop; read across, the row is the
                sentence it always was, and the eye can compare four figures
                down a single right edge instead of hunting for each one.

                The class still leads the place in document order, which is the
                order the record states things in everywhere else: what kind of
                evidence this is, then what it says.
              */}
              <div className="province-list-head-row">
                <div className="province-list-identity">
                  <p className="province-list-mark">
                    <span
                      className={showingLoss ? "mark-glyph mark-glyph--satellite" : "mark-glyph mark-glyph--unknown"}
                      aria-hidden="true"
                    />
                    {EVIDENCE_DEFINITIONS[showingLoss ? "satellite-observation" : "unknown"].label[locale]}
                  </p>

                  <h3 className="province-list-place">
                    {row.name[locale]}, <span className="province-list-span">{span}</span>
                  </h3>
                </div>

                {/*
                  Whole hectares. Two decimal places on a satellite-derived floor
                  claim centimetres no source can back. The recorded value stays
                  at the foot of the row, so the rounding costs nothing.

                  The unit is a span rather than part of the number so it can sit
                  at reading weight beside a figure set at 42px. The text the
                  element renders is unchanged, which is what the rendered-page
                  assertion measures.
                */}
                <p className="province-list-figure">
                  {showingLoss ? (
                    <>
                      <span className="province-list-value">
                        {row.unionLossHectares === null ? "Unknown" : formatNumber(row.unionLossHectares, locale, 0)}
                      </span>{" "}
                      <span className="province-list-unit">ha</span>
                    </>
                  ) : (
                    <span className="province-list-value">{unknownShare}</span>
                  )}
                </p>
              </div>

              {((showingLoss && row.unionLossHectares !== null) || (!showingLoss && mappedShare !== null)) && (
              <span className="province-list-track" aria-hidden="true">
                {showingLoss && row.unionLossHectares !== null ? (
                  <span
                    className="province-list-fill"
                    style={{ width: `${row.unionLossHectares / lossScale * 100}%` }}
                  />
                ) : (
                  <>
                    <span className="province-list-fill" style={{ width: `${mappedShare ?? 0}%` }} />
                    <span className="province-list-gap" style={{ width: `${row.unknownSharePercent}%` }} />
                  </>
                )}
              </span>)}

              {/*
                The caveat and the value it rests on, side by side. They were a
                paragraph and then a bordered band across the full width, which
                read as two separate footnotes; the rule between them said the
                recorded value belonged to the row rather than to the sentence
                immediately above it.
              */}
              <div className="province-list-base">
                {showingLoss ? (
                  <p className="province-list-note">
                    {row.unionLossPercent === null ? "Unknown" : formatPercent(row.unionLossPercent, locale)} {copy.basis}{" "}
                    <strong>{unknownShare}</strong> {copy.basisEnd}{character}
                  </p>
                ) : (
                  <p className="province-list-note">
                    <strong>{row.unknownHectares === null ? "Unknown" : formatHectares(row.unknownHectares, locale, 0)}</strong>{" "}
                    {copy.coverNote} {copy.coverEnd}{character}
                  </p>
                )}

                <p className="sr-only">{unknownContexts[row.id]}</p>

                <p className="province-list-foot">
                  <span>
                    {showingLoss
                      ? `${row.unionLossHectares === null ? "Unknown" : formatNumber(row.unionLossHectares, locale, 2)} ${copy.recorded}`
                      : `${row.unknownHectares === null ? "Unknown" : formatNumber(row.unknownHectares, locale, 2)} ${copy.measured}`}
                  </span>
                  <Link href={locale === "en" ? "/en/data" : "/fr/donnees"}>{copy.sources}</Link>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
