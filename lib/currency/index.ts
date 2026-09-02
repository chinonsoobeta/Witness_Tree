/**
 * How current the source is, said on the page rather than left to be inferred.
 *
 * The site's period is a fact about what has been ingested, not a fact about
 * today. Those two are indistinguishable to a reader unless the page says when
 * the publisher was last asked and what it answered, so this narrows the probe
 * record down to exactly that and nothing else.
 */

import record from "@/data/nrcan-source-currency.json";

export type SourceCurrencyProduct = Readonly<{
  id: string;
  title: string;
  ingestedThroughYear: number;
  latestPublishedYear: number;
  behindByYears: number;
}>;

export type SourceCurrency = Readonly<{
  /** The calendar date of the probe, in the publisher's own UTC terms. */
  checkedOn: string;
  host: string;
  firstYear: number;
  lastYear: number;
  laterYearPublished: boolean;
  publisherRevisedAnIngestedYear: boolean;
  products: readonly SourceCurrencyProduct[];
}>;

export const sourceCurrency: SourceCurrency = Object.freeze({
  checkedOn: record.observedAt.slice(0, 10),
  host: record.host,
  firstYear: record.coverageClaim.firstYear,
  lastYear: record.coverageClaim.lastYear,
  laterYearPublished: record.laterYearPublished,
  publisherRevisedAnIngestedYear: record.publisherRevisedAnIngestedYear,
  products: Object.freeze(
    record.products.map((product) =>
      Object.freeze({
        id: product.id,
        title: product.title,
        ingestedThroughYear: product.ingestedThroughYear,
        latestPublishedYear: product.latestPublishedYear,
        behindByYears: product.behindByYears,
      }),
    ),
  ),
});
