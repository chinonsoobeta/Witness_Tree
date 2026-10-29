import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  comparableRidings,
  comparisonRankings,
  federalRidingComparison,
  provincialRidingComparison,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/comparison/real.ts";
import { rankRidings
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/comparison/ranking.ts";
import EnglishComparePage
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../app/en/compare/page.tsx";
import FrenchComparePage
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../app/fr/comparer/page.tsx";
import { FederalDistrictFinder
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/search/FederalDistrictFinder.tsx";
import { RankedRidingsTable
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/comparison/RankedRidingsTable.tsx";

test("the checked-in real comparison has 343 extent-corrected districts", () => {
  assert.equal(federalRidingComparison.rows.length, 343);
  assert.equal(federalRidingComparison.rows.filter((row) => row.sufficientCoverage).length, 57);
  assert.equal(federalRidingComparison.rows.filter((row) => !row.sufficientCoverage).length, 286);
  assert.equal(federalRidingComparison.rows.filter((row) => row.measurementCoverage !== "complete" && (row.detectedChangeHectares !== null || row.detectedChangePercent !== null)).length, 0);
  assert.equal(federalRidingComparison.rows.filter((row) => !row.sufficientCoverage && row.measurementCoverage === "complete" && row.forestedHectares > 0 && row.forestedHectares < 500).length, 12);
  assert.deepEqual(new Set(federalRidingComparison.rows.map((row) => row.id)).size, 343);
  const ranked = rankRidings(federalRidingComparison.rows).ranked;
  assert.equal(ranked[0]?.name.en, "Charlottetown");
  assert.ok(ranked.every((row) => row.forestedHectares >= 500));
  assert.doesNotMatch(federalRidingComparison.context.method.en, /British Columbia, Alberta, Ontario and Quebec/);
});

test("the comparison lists only four-province districts under truthful coverage reasons", () => {
  const english = renderToStaticMarkup(
    <RankedRidingsTable rows={federalRidingComparison.comparisonRows} context={federalRidingComparison.context} locale="en" />,
  );
  const french = renderToStaticMarkup(
    <RankedRidingsTable rows={federalRidingComparison.comparisonRows} context={federalRidingComparison.context} locale="fr" />,
  );
  for (const html of [english, french]) assert.equal((html.match(/<th scope="row">/g) ?? []).length, 280);
  assert.match(english, /36 of 280 federal ridings are ranked\./);
  assert.match(english, /Of the rest, 165 were not mapped at all, 67 were only partly mapped, and 12 have less than 500 hectares of forest\./);
  assert.match(french, /36 des 280 circonscriptions fédérales sont classées\./);
  assert.match(french, /Parmi les autres, 165 n’ont pas du tout été cartographiées, 67 ne l’ont été qu’en partie, et 12 comptent moins de 500 hectares de forêt\./);
  assert.doesNotMatch(`${english}${french}`, /Insufficient coverage, not ranked|Couverture insuffisante, non classée/);

  const none = english.indexOf("No mapped coverage, not ranked");
  const partial = english.indexOf("Partial mapped coverage, not ranked");
  const belowFloor = english.indexOf("Complete mapped coverage below 500 forested hectares, not ranked");
  const cloverdale = english.indexOf("Cloverdale\u2014Langley City");
  assert.doesNotMatch(english, /Central Nova|Charlottetown|Malpeque|Cardigan|Kings\u2014Hants|Beauséjour|Prince Albert/);
  assert.ok(none > 0 && partial > none && belowFloor > partial);
  assert.ok(cloverdale > belowFloor, "a completely mapped small-forest district belongs only under the ranking-floor heading");
  assert.equal((english.slice(none, partial).match(/<span class="coverage-band">Not mapped<\/span>/g) ?? []).length, 165);
  assert.equal((english.slice(partial, belowFloor).match(/<span class="coverage-band">Partly mapped; an unknown area remains<\/span>/g) ?? []).length, 67);
  assert.equal((english.slice(belowFloor).match(/<span class="coverage-band">Fully mapped<\/span>/g) ?? []).length, 12);
  assert.match(french, /aria-label="Aucune couverture cartographiée, non classée \(165\)"/);
  assert.match(french, /aria-label="Couverture cartographiée partielle, non classée \(67\)"/);
  assert.match(french, /aria-label="Couverture cartographiée complète sous le seuil de 500 hectares forestiers, non classée \(12\)"/);
});

test("the comparison scope and defaults are derived from the four-province data", () => {
  assert.equal(federalRidingComparison.comparisonRows.length, 280);
  assert.ok(federalRidingComparison.comparisonRows.every((row) => /^federal-(24|35|48|59)/.test(row.id)));
  assert.equal(federalRidingComparison.comparisonRows.filter((row) => row.sufficientCoverage).length, 36);
  const [left, right] = federalRidingComparison.defaultPair;
  assert.deepEqual([left.id, right.id], ["federal-59001", "federal-59011"]);
  assert.ok(left.sufficientCoverage && right.sufficientCoverage);
  assert.notEqual(left.id, right.id);
});

test("the real federal district finder links source names into Compare", () => {
  const html = renderToStaticMarkup(<FederalDistrictFinder locale="en" query="Abbotsford" rows={federalRidingComparison.places} />);
  assert.match(html, /href="\/en\/compare\?left=federal-59001"/);
  assert.match(html, /Abbotsford/);
});

test("both comparison routes use real data and preserve exact selected ids", async () => {
  const parameters = Promise.resolve({ left: "federal-59001", right: "federal-59006", view: "table", sort: "share-asc" });
  const english = renderToStaticMarkup(await EnglishComparePage({ searchParams: parameters }));
  const french = renderToStaticMarkup(await FrenchComparePage({ searchParams: parameters }));
  assert.match(english, /Figures for 2021–2022, for the mapped part of each riding/);
  assert.match(french, /Chiffres pour 2021–2022, pour la partie cartographiée de chaque circonscription/);
  for (const html of [english, french]) {
    assert.match(html, /option value="federal-59001" selected/);
    assert.match(html, /option value="federal-59006" selected/);
    assert.match(html, /name="sort" value="share-asc"/);
    assert.match(html, /unknown|inconnu/i);
  }
  assert.ok(english.indexOf("Side-by-side comparison") < english.indexOf("Detected loss as a share of forested area"));
  assert.ok(french.indexOf("Comparaison côte à côte") < french.indexOf("Perte détectée en proportion de la superficie forestière"));
  const englishSource = readFileSync(new URL("../app/en/compare/page.tsx", import.meta.url), "utf8");
  const frenchSource = readFileSync(new URL("../app/fr/comparer/page.tsx", import.meta.url), "utf8");
  for (const source of [englishSource, frenchSource]) {
    assert.doesNotMatch(source, /comparisonFixtures|rankedRidingFixtures|comparisonContext/);
    assert.match(source, /federalRidingComparison/);
  }
});

test("both comparison routes default to covered measured ridings", async () => {
  const english = renderToStaticMarkup(await EnglishComparePage({ searchParams: Promise.resolve({}) }));
  const french = renderToStaticMarkup(await FrenchComparePage({ searchParams: Promise.resolve({}) }));
  for (const html of [english, french]) {
    assert.match(html, /option value="federal-59001" selected/);
    assert.match(html, /option value="federal-59011" selected/);
    assert.doesNotMatch(html, /option value="federal-(?!24|35|48|59)/);
  }
});

const render = async (parameters: Record<string, string>) => [
  renderToStaticMarkup(await EnglishComparePage({ searchParams: Promise.resolve(parameters) })),
  renderToStaticMarkup(await FrenchComparePage({ searchParams: Promise.resolve(parameters) })),
] as const;

test("an unknown riding id shows a notice and leaves its side empty, with nothing in its place", async () => {
  const [english, french] = await render({ left: "federal-missing", right: "federal-59006" });
  assert.match(english, /Left side: no riding has the id “federal-missing”\. Choose a riding below\./);
  assert.match(french, /Côté gauche\u202F: aucune circonscription ne porte l’identifiant «\u00A0federal-missing\u00A0»\./);
  assert.ok(english.indexOf("Left side: no riding") < english.indexOf("Side-by-side comparison"));
  assert.ok(french.indexOf("Côté gauche") < french.indexOf("Comparaison côte à côte"));
  for (const html of [english, french]) {
    assert.match(html, /<select name="left"><option value="" selected="">/);
    assert.match(html, /option value="federal-59006" selected/);
    assert.equal((html.match(/ selected=""/g) ?? []).length, 2, "the empty option and the right riding");
    assert.match(html, /comparison-card--empty/);
    assert.doesNotMatch(html, /option value="federal-59001" selected/, "the default riding is not put in its place");
  }
  assert.match(english, /<h2>No riding chosen<\/h2>/);
  assert.match(french, /<h2>Aucune circonscription choisie<\/h2>/);
});

test("the same riding on both sides is shown once, and a riding outside the four provinces is named", async () => {
  const [english, french] = await render({ left: "federal-59001", right: "federal-59001" });
  assert.match(english, /Both sides asked for Abbotsford—South Langley, so it is shown once\. Choose a different riding for the other side\./);
  assert.match(french, /Les deux côtés demandaient Abbotsford—Langley-Sud\u202F; elle n’est donc affichée qu’une fois\./);
  for (const html of [english, french]) {
    const comparison = html.slice(html.indexOf('class="comparison-side-by-side"'), html.indexOf('class="comparison-table"'));
    assert.equal((comparison.match(/Abbotsford—(South Langley|Langley-Sud)/g) ?? []).length, 1);
    assert.match(html, /<select name="right"><option value="" selected="">/);
  }
  const outside = federalRidingComparison.rows.find((row) => !/^federal-(24|35|48|59)/.test(row.id))!;
  const [away, loin] = await render({ left: outside.id, right: "federal-59006" });
  assert.match(away, new RegExp(`Left side: ${outside.name.en} is a federal riding outside the four provinces the record covers, so it can’t be compared here\\.`));
  assert.match(loin, new RegExp(`Côté gauche\u202F: ${outside.name.fr} est une circonscription fédérale située hors des quatre provinces`));
});

test("a federal riding sits beside a provincial one, each labelled, each with its own ranking", async () => {
  const [english, french] = await render({ left: "federal-59001", right: "provincial-BC-258" });
  for (const html of [english, french]) {
    assert.match(html, /option value="provincial-BC-258" selected=""/);
    assert.doesNotMatch(html, /role="status"/);
    assert.match(html, /id="rankings-federal"/);
    assert.match(html, /id="rankings-BC"/);
    assert.doesNotMatch(html, /id="rankings-(AB|ON|QC)"/);
    const comparison = html.slice(html.indexOf('class="comparison-side-by-side"'), html.indexOf('class="comparison-table"'));
    assert.ok(comparison.indexOf("Abbotsford—South Langley") < comparison.indexOf("Abbotsford-Mission"));
  }
  assert.match(english, /Federal riding · British Columbia/);
  assert.match(english, /Provincial riding · British Columbia/);
  assert.match(french, /Circonscription fédérale · Colombie-Britannique/);
  assert.match(french, /Circonscription provinciale · Colombie-Britannique/);
  assert.match(english, /<h2 id="rankings-federal-heading">Federal ridings in the four provinces<\/h2>/);
  assert.match(english, /<h2 id="rankings-BC-heading">Provincial ridings in British Columbia<\/h2>/);
  assert.match(french, /<h2 id="rankings-federal-heading">Circonscriptions fédérales des quatre provinces<\/h2>/);
  assert.match(french, /<h2 id="rankings-BC-heading">Circonscriptions provinciales de la Colombie-Britannique<\/h2>/);
  assert.match(english, /53 of British Columbia’s 93 provincial ridings are ranked\./);
  assert.match(french, /53 des 93 circonscriptions provinciales de la Colombie-Britannique sont classées\./);
  assert.match(english, /36 of 280 federal ridings are ranked\./);

  const [table] = await render({ left: "provincial-QC-137", right: "provincial-ON-89", view: "table" });
  assert.match(table, /Provincial riding · Québec/);
  assert.match(table, /Provincial riding · Ontario/);
  assert.doesNotMatch(table, /id="rankings-federal"/, "only the chosen ridings' rankings are shown");
  assert.ok(table.indexOf('id="rankings-ON"') < table.indexOf('id="rankings-QC"'), "provinces in their west-to-east order");
});

test("provincial ridings rank only within their own province, with their own counts", () => {
  const expected = { BC: [93, 53], AB: [87, 7], ON: [124, 11], QC: [127, 26] } as const;
  for (const [province, [total, ranked]] of Object.entries(expected)) {
    const rows = provincialRidingComparison.rowsByProvince[province as keyof typeof expected];
    assert.equal(rows.length, total, province);
    assert.ok(rows.every((row: { id: string }) => row.id.startsWith(`provincial-${province}-`)));
    assert.equal(rankRidings(rows).ranked.length, ranked, province);
    assert.ok(rankRidings(rows).ranked.every((row: { forestedHectares: number }) => row.forestedHectares >= 500));
  }
  assert.equal(provincialRidingComparison.rows.length, 431);
  assert.equal(comparableRidings.length, 711);
  // A riding with a sliver unmapped (under 1%) ranks on its mapped forest and says so; it is never 0.
  const admitted = provincialRidingComparison.rows.flatMap((row: { admittedUnknownPercent?: number }) => row.admittedUnknownPercent === undefined ? [] : [row.admittedUnknownPercent]);
  assert.ok(admitted.length > 0 && admitted.every((share: number) => share > 0 && share < 1));
  assert.ok(provincialRidingComparison.rows.every((row: { measurementCoverage: string; detectedChangePercent: number | null }) =>
    row.measurementCoverage === "complete" || row.detectedChangePercent === null));

  const [federal, bc] = comparisonRankings([federalRidingComparison.defaultPair[0], provincialRidingComparison.rowsByProvince.BC[0]]);
  assert.deepEqual(federal.scope, { level: "federal", nationalTotal: 343 });
  assert.deepEqual(bc.scope, { level: "provincial", province: "BC" });
  assert.match(bc.context.method.en, /against the other provincial ridings of British Columbia only/);
  assert.match(bc.context.method.fr, /uniquement par rapport aux autres circonscriptions provinciales de la Colombie-Britannique/);
  assert.equal(bc.context.boundaryEdition, "BC 2023");

  const english = renderToStaticMarkup(<RankedRidingsTable rows={bc.rows} context={bc.context} scope={bc.scope} locale="en" />);
  assert.equal((english.match(/<th scope="row">/g) ?? []).length, 93);
  assert.doesNotMatch(english, /Abbotsford—South Langley/, "no federal riding in a provincial ranking");
  assert.match(english, /unmapped; the share is of the mapped forest/);
  // Only the reasons that apply are named, in the right number.
  assert.match(english, /53 of British Columbia’s 93 provincial ridings are ranked\. Of the rest, 7 were only partly mapped and 33 have less than 500 hectares of forest\./);
  const alberta = { rows: provincialRidingComparison.rowsByProvince.AB, context: provincialRidingComparison.contexts.AB, scope: { level: "provincial" as const, province: "AB" as const } };
  assert.match(renderToStaticMarkup(<RankedRidingsTable {...alberta} locale="en" />), /Of the rest, 79 were only partly mapped and 1 has less than 500 hectares of forest\./);
  assert.match(renderToStaticMarkup(<RankedRidingsTable {...alberta} locale="fr" />), /7 des 87 circonscriptions provinciales de l’Alberta sont classées\. Parmi les autres, 79 ne l’ont été qu’en partie et 1 compte moins de 500 hectares de forêt\./);
});

test("Compare shows the first 20 of each ranking until the reader asks for all of it", async () => {
  const [english, french] = await render({ left: "federal-59001", right: "provincial-BC-258" });
  const federal = (html: string) => html.slice(html.indexOf('id="rankings-federal"'), html.indexOf('id="rankings-BC"'));
  for (const html of [english, french]) {
    assert.equal((federal(html).match(/<th scope="row">/g) ?? []).length, 20);
    assert.doesNotMatch(federal(html), /comparison-unranked/);
    assert.match(federal(html), /href="\?sort=share-desc&amp;left=federal-59001&amp;right=provincial-BC-258&amp;view=cards&amp;rankings=all#rankings-federal"/);
  }
  assert.match(federal(english), /Showing the first 20 of 36 ranked ridings\. The 244 not ranked are listed with the whole ranking\./);
  assert.match(federal(english), />Show all 280 federal ridings<\/a>/);
  assert.match(federal(french), /Les 20 premières des 36 circonscriptions classées sont affichées\. Les 244 circonscriptions non classées figurent dans la liste complète\./);
  assert.match(federal(french), />Afficher les 280 circonscriptions fédérales<\/a>/);
  assert.match(english, />Show all 93 provincial ridings in British Columbia<\/a>/);
  assert.match(french, />Afficher les 93 circonscriptions provinciales de la Colombie-Britannique<\/a>/);

  const [all, tout] = await render({ left: "federal-59001", right: "provincial-BC-258", rankings: "all" });
  for (const html of [all, tout]) {
    assert.equal((federal(html).match(/<th scope="row">/g) ?? []).length, 280);
    assert.equal((html.slice(html.indexOf('id="rankings-BC"')).match(/<th scope="row">/g) ?? []).length, 93);
    assert.doesNotMatch(html, /comparison-ranking-more/);
    assert.match(html, /name="rankings" value="all"/);
    assert.match(html, /href="\?sort=share-asc&amp;left=federal-59001&amp;right=provincial-BC-258&amp;view=cards&amp;rankings=all#rankings-federal"/);
  }
});

test("the federal count is reconciled with Canada's 343 ridings in both languages", async () => {
  const [english, french] = await render({});
  assert.match(english, /These 280 are the federal ridings in British Columbia, Alberta, Ontario and Québec, the four provinces the record covers; Canada has 343\./);
  assert.match(french, /Ces 280 circonscriptions sont celles de la Colombie-Britannique, de l’Alberta, de l’Ontario et du Québec, les quatre provinces que couvre le registre\u202F; le Canada en compte 343\./);
  for (const html of [english, french]) {
    assert.doesNotMatch(html, /id="rankings-(BC|AB|ON|QC)"/);
    assert.doesNotMatch(html, /Unknown in every row|inconnue à chaque ligne/);
  }
  assert.match(english, /The tables leave it out rather than show a column of Unknowns\./);
});

test("comparison routes state comparability limits before controls and figures", async () => {
  for (const Page of [EnglishComparePage, FrenchComparePage]) {
    const markup = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    const note = markup.indexOf('<details class="coverage-note">');
    assert.ok(note >= 0 && note < markup.indexOf('class="comparison-picker"'));
    // The comparison's figures carry no evidence marks, so no key is shown.
    assert.doesNotMatch(markup, /class="evidence-(legend|key)"/);
    assert.match(markup, /less was mapped|une plus petite partie a été cartographiée/);
  }
});

test("both comparison routes serve the two ridings a search link and the riding fields submit", async () => {
  const parameters = Promise.resolve({ left: "federal-59021", right: "federal-24057" });
  const english = renderToStaticMarkup(await EnglishComparePage({ searchParams: parameters }));
  const french = renderToStaticMarkup(await FrenchComparePage({ searchParams: parameters }));
  for (const [html, heading] of [[english, "Side-by-side comparison"], [french, "Comparaison côte à côte"]] as const) {
    // Before the riding fields hydrate, and without JavaScript, the form is the two native selects.
    assert.match(html, /<select name="left"[^>]*>[\s\S]*?<option value="federal-59021" selected="">North Island—Powell River<\/option>[\s\S]*?<\/select>/);
    assert.match(html, /<select name="right"[^>]*>[\s\S]*?<option value="federal-24057" selected="">Pontiac—Kitigan Zibi<\/option>[\s\S]*?<\/select>/);
    assert.equal((html.match(/ selected=""/g) ?? []).length, 2);
    assert.doesNotMatch(html, /isn’t available here|n’est pas offerte ici/);
    const comparison = html.slice(html.indexOf(heading));
    const left = comparison.indexOf("North Island—Powell River");
    const right = comparison.indexOf("Pontiac—Kitigan Zibi");
    assert.ok(left > 0 && right > left, "the left riding is shown before the right one");
  }
});
