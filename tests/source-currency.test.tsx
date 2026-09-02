import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SourceCurrency } from "../components/transparency/SourceCurrency";
import { DataPage } from "../components/transparency/DataPage";
import { sourceCurrency } from "../lib/currency";

const probe = JSON.parse(readFileSync(new URL("../data/nrcan-source-currency.json", import.meta.url), "utf8"));

test("the page states the date the publisher was asked, taken from the probe and not from prose", () => {
  const english = renderToStaticMarkup(<SourceCurrency locale="en" />);
  const french = renderToStaticMarkup(<SourceCurrency locale="fr" />);
  const checkedOn = probe.observedAt.slice(0, 10);
  assert.equal(sourceCurrency.checkedOn, checkedOn);
  for (const markup of [english, french]) {
    assert.ok(markup.includes(checkedOn), "the observation date must be on the page");
    assert.ok(markup.includes(probe.host), "the host that was asked must be on the page");
  }
  // Both locales, because a French reader is owed the same fact.
  assert.match(english, /How current the source is/);
  assert.match(french, /Actualité de la source/);
});

test("every year on the page comes from the probe, and nothing else does", () => {
  const markup = renderToStaticMarkup(<SourceCurrency locale="en" />);
  const permitted = new Set<string>([String(sourceCurrency.lastYear), probe.observedAt.slice(0, 4)]);
  for (const product of probe.products) {
    permitted.add(String(product.ingestedThroughYear));
    permitted.add(String(product.latestPublishedYear));
    assert.ok(markup.includes(String(product.latestPublishedYear)), `${product.id} published year is missing`);
  }
  for (const [year] of markup.matchAll(/\b(19\d{2}|20\d{2})\b/g)) {
    assert.ok(permitted.has(year), `the page shows ${year}, which the probe record does not contain`);
  }
});

test("the standing sentence follows the record rather than the copy", () => {
  // The record currently says nothing later is published. The page must say so,
  // and must say the opposite when the record does.
  assert.equal(sourceCurrency.laterYearPublished, false);
  const current = renderToStaticMarkup(<SourceCurrency locale="en" />);
  assert.match(current, /is the period the publisher offers/);
  assert.doesNotMatch(current, /behind the publisher/);
  assert.doesNotMatch(current, /can differ from the same year read from the source today/);
});

test("the Data page carries the section in both locales", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<DataPage locale={locale} />);
    assert.ok(markup.includes(probe.observedAt.slice(0, 10)), `${locale} data page is missing the observation date`);
  }
});
