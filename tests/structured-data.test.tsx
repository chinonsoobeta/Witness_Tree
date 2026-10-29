import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DataPage } from "../components/transparency/DataPage";
import { HarvestFirePage } from "../components/transparency/HarvestFirePage";
import { PRODUCT_NAME } from "../lib/domain";
import { HARVEST_FIRE_RECORD_URL, parseHarvestFireQuery } from "../lib/harvest-fire";

const json = (path: string) => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), "utf8"));
const publication = json("bulk-download-publication.json");
const manifest = json("phase8-bulk-download-public-manifest.json");
const spanRecord = json("phase3-province-span-downloads-release.json");
const readback = json("phase1-catalogue-readback-2026-09-26.json");
const boundaryEditions = json("boundary-editions.json");
const harvestFire = json("harvest-fire-province-annual-series.json");

type Download = { "@type": string; encodingFormat: string; contentUrl: string; sha256?: string; identifier?: string; contentSize?: string };
type Dataset = {
  "@context": string;
  "@type": string;
  name: string;
  description: string;
  url: string;
  version?: string;
  license: string | string[];
  creator: { "@type": string; name: string; url: string };
  spatialCoverage: Array<{ "@type": string; name: string }>;
  temporalCoverage: string;
  isBasedOn: Array<{ "@type": string; name: string; url: string }>;
  distribution: Download[];
};

/** Every JSON-LD block on a rendered page, parsed, with the page's visible markup. */
function render(markup: string) {
  const blocks = [...markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const visible = markup.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
  return { datasets: blocks.flatMap((block) => JSON.parse(block)) as Dataset[], visible, raw: blocks.join("") };
}

const ENDORSEMENT = /endors|approuv|approbation|sponsor|partner|partenaire|on behalf of|au nom de/i;
const vlce2Catalogue = `https://open.canada.ca/data/en/dataset/${readback.entries.find((entry: { row: string }) => entry.row === "ntems-annual-land-cover").id}`;
const boundaryCatalogue = boundaryEditions.editions.find((edition: { id: string }) => edition.id === "statcan-2021-provinces-territories-cbf").catalogueUrl;

function assertCommon(dataset: Dataset, locale: "en" | "fr") {
  assert.equal(dataset["@context"], "https://schema.org");
  assert.equal(dataset["@type"], "Dataset");
  for (const field of ["name", "description", "url", "license", "creator", "spatialCoverage", "temporalCoverage", "isBasedOn", "distribution"] as const) {
    assert.ok(dataset[field], `missing ${field}`);
  }
  assert.ok(dataset.description.length >= 50 && dataset.description.length <= 5000);
  assert.deepEqual(dataset.creator, { "@type": "Organization", name: PRODUCT_NAME[locale], url: "https://www.witnesstree.ca" });
  assert.equal(dataset.spatialCoverage.length, 4);
  assert.ok(dataset.spatialCoverage.every((place) => place["@type"] === "Place"));
  assert.ok(dataset.spatialCoverage.some((place) => place.name === "Québec"));
  // The limits travel with the record: a preview, minima, Unknown never zero.
  const description = dataset.description;
  assert.match(description, locale === "en" ? /technical preview/ : /aperçu technique/);
  assert.match(description, locale === "en" ? /never counted as zero/ : /jamais compté comme zéro/);
  assert.match(description, locale === "en" ? /Unknown/ : /inconnu/);
  assert.ok(dataset.distribution.every((file) => file["@type"] === "DataDownload" && file.encodingFormat && /^https:\/\//.test(file.contentUrl)));
}

for (const locale of ["en", "fr"] as const) {
  test(`the ${locale} Data page describes both province releases with the record's identifiers`, () => {
    const { datasets, visible, raw } = render(renderToStaticMarkup(<DataPage locale={locale} />));
    assert.equal(datasets.length, 2);
    const [bulk, span] = datasets;
    for (const dataset of datasets) {
      assertCommon(dataset, locale);
      assert.equal(dataset.url, `https://www.witnesstree.ca${locale === "en" ? "/en/data" : "/fr/donnees"}`);
      assert.deepEqual(dataset.license, manifest.licences.map((licence: { url: string }) => licence.url));
      assert.deepEqual(new Set(dataset.license), new Set(["https://open.canada.ca/en/open-government-licence-canada", "https://www.statcan.gc.ca/en/reference/licence"]));
      assert.deepEqual(new Set(dataset.isBasedOn.map((source) => source.url)), new Set([vlce2Catalogue, boundaryCatalogue]));
      for (const file of dataset.distribution) {
        assert.equal(file.identifier, `sha256:${file.sha256}`);
        assert.ok(visible.includes(file.sha256!), `the page must show the checksum ${file.sha256}`);
        assert.ok(visible.includes(file.contentUrl), `the page must link ${file.contentUrl}`);
      }
    }
    assert.match(bulk.description, locale === "en" ? /bounded technical preview, not a final release/ : /aperçu technique limité, et non une version définitive/);

    assert.equal(bulk.version, publication.releaseId);
    assert.equal(bulk.version, manifest.releaseId);
    assert.ok(visible.includes(bulk.version!), "the page must show the release identifier");
    assert.equal(bulk.temporalCoverage, "2020/2022");
    assert.deepEqual(bulk.distribution.map(({ contentUrl, sha256, encodingFormat }) => ({ contentUrl, sha256, encodingFormat })), [
      { contentUrl: publication.artifacts.csv.publicUrl, sha256: publication.artifacts.csv.sha256, encodingFormat: "text/csv" },
      { contentUrl: publication.artifacts.geopackage.publicUrl, sha256: publication.artifacts.geopackage.sha256, encodingFormat: "application/geopackage+sqlite3" },
    ]);

    assert.equal(span.version, spanRecord.releaseId);
    assert.equal(span.temporalCoverage, "1984/2022");
    assert.deepEqual(span.distribution.map(({ contentUrl, sha256, encodingFormat }) => ({ contentUrl, sha256, encodingFormat })), [
      { contentUrl: spanRecord.files[0].url, sha256: spanRecord.files[0].sha256, encodingFormat: "text/csv" },
      { contentUrl: spanRecord.files[1].url, sha256: spanRecord.files[1].sha256, encodingFormat: "application/json" },
    ]);

    assert.doesNotMatch(raw, ENDORSEMENT);
    assert.doesNotMatch(raw, /<\/?[a-z]/i, "no markup may appear inside the data block");
  });

  test(`the ${locale} harvest-and-fire page describes the annual series`, () => {
    const markup = renderToStaticMarkup(<HarvestFirePage locale={locale} query={parseHarvestFireQuery({})} />);
    const { datasets, raw } = render(markup);
    assert.equal(datasets.length, 1);
    const [series] = datasets;
    assertCommon(series, locale);
    assert.equal(series.url, `https://www.witnesstree.ca${locale === "en" ? "/en/data/harvest-and-fire" : "/fr/donnees/recolte-et-incendies"}`);
    assert.equal(series.temporalCoverage, `${harvestFire.firstYear}/${harvestFire.lastYear}`);
    assert.equal(series.temporalCoverage, "1985/2022");
    assert.equal(series.license, harvestFire.sources.licenceUrl);
    assert.deepEqual(series.isBasedOn.map((source) => source.url), [harvestFire.sources.harvest.url, harvestFire.sources.fire.url, boundaryCatalogue]);
    // The download is the same record the page links, served as the file itself.
    assert.ok(markup.includes(HARVEST_FIRE_RECORD_URL));
    assert.deepEqual(series.distribution, [{
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: HARVEST_FIRE_RECORD_URL.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/"),
    }]);
    assert.doesNotMatch(raw, ENDORSEMENT);
  });
}
