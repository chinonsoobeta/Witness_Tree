import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  comparableRidings,
  comparisonRankings,
  parseRankingTab,
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
import { CitiesMostLost
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/site/RidingsMostLost.tsx";

test("the comparison reads 1984–2022 from the riding interval release and accounts for Canada's 343 federal ridings", () => {
  assert.equal(federalRidingComparison.rows.length, 280);
  assert.equal(federalRidingComparison.outside.length, 63);
  assert.equal(federalRidingComparison.nationalTotal, 343);
  assert.equal(federalRidingComparison.context.timeRange, "1984–2022");
  assert.equal(provincialRidingComparison.contexts.BC.timeRange, "1984–2022", "both levels describe the same years");
  assert.equal(federalRidingComparison.rows.filter((row) => row.sufficientCoverage).length, 42);
  assert.equal(federalRidingComparison.rows.filter((row) => !row.sufficientCoverage).length, 238);
  assert.equal(federalRidingComparison.rows.filter((row) => row.measurementCoverage !== "complete" && (row.detectedChangeHectares !== null || row.detectedChangePercent !== null)).length, 0);
  assert.equal(federalRidingComparison.rows.filter((row) => !row.sufficientCoverage && row.measurementCoverage === "complete" && row.forestedHectares > 0 && row.forestedHectares < 500).length, 13);
  assert.equal(new Set([...federalRidingComparison.rows, ...federalRidingComparison.outside].map((row) => row.id)).size, 343);
  assert.ok(federalRidingComparison.outside.every((row) => !/^federal-(24|35|48|59)/.test(row.id)));
  const ranked = rankRidings(federalRidingComparison.rows).ranked;
  assert.equal(ranked[0]?.name.en, "Abbotsford—South Langley");
  assert.ok(ranked.every((row) => row.forestedHectares >= 500));
  assert.ok(federalRidingComparison.rows.some((row) => row.admittedUnknownPercent !== undefined), "the owner's 1% rule admits some ridings, with their unmapped share");
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
  assert.match(english, /42 of 280 federal ridings are ranked\./);
  assert.match(english, /Of the rest, 225 were only partly mapped and 13 have less than 500 hectares of forest\./);
  assert.match(french, /42 des 280 circonscriptions fédérales sont classées\./);
  assert.match(french, /Parmi les autres, 225 ne l’ont été qu’en partie et 13 comptent moins de 500 hectares de forêt\./);
  assert.doesNotMatch(`${english}${french}`, /Insufficient coverage, not ranked|Couverture insuffisante, non classée/);

  // Over the whole record every federal riding in the four provinces had some forest mapped,
  // so there is no not-mapped table, and no riding is written as unmapped.
  assert.equal(english.indexOf("No mapped coverage, not ranked"), -1);
  assert.doesNotMatch(english, /<span class="coverage-band">Not mapped<\/span>/);
  const partial = english.indexOf("Partial mapped coverage, not ranked");
  const belowFloor = english.indexOf("Complete mapped coverage below 500 forested hectares, not ranked");
  const cloverdale = english.indexOf("Cloverdale\u2014Langley City");
  assert.doesNotMatch(english, /Central Nova|Charlottetown|Malpeque|Cardigan|Kings\u2014Hants|Beauséjour|Prince Albert/);
  assert.ok(partial > 0 && belowFloor > partial);
  assert.ok(cloverdale > belowFloor, "a completely mapped small-forest district belongs only under the ranking-floor heading");
  assert.equal((english.slice(partial, belowFloor).match(/<span class="coverage-band">Partly mapped; an unknown area remains<\/span>/g) ?? []).length, 225);
  assert.equal((english.slice(belowFloor).match(/<span class="coverage-band">Fully mapped<\/span>/g) ?? []).length, 13);
  assert.doesNotMatch(french, /aria-label="Aucune couverture cartographiée, non classée/);
  assert.match(french, /aria-label="Couverture cartographiée partielle, non classée \(225\)"/);
  assert.match(french, /aria-label="Couverture cartographiée complète sous le seuil de 500 hectares forestiers, non classée \(13\)"/);
});

test("the comparison scope is derived from the four-province data, with no default pair", () => {
  assert.equal(federalRidingComparison.comparisonRows.length, 280);
  assert.ok(federalRidingComparison.comparisonRows.every((row) => /^federal-(24|35|48|59)/.test(row.id)));
  assert.equal(federalRidingComparison.comparisonRows.filter((row) => row.sufficientCoverage).length, 42);
  assert.equal("defaultPair" in federalRidingComparison, false, "the page no longer opens on a pre-filled pair");
  const [first, second] = rankRidings(federalRidingComparison.comparisonRows).ranked;
  assert.deepEqual([first.id, second.id], ["federal-59001", "federal-59011"], "the federal ranking still leads with the same two");
  assert.ok(first.sufficientCoverage && second.sufficientCoverage);
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
  assert.match(english, /Figures for 1984–2022, for the mapped part of each riding/);
  assert.match(french, /Chiffres pour 1984–2022, pour la partie cartographiée de chaque circonscription/);
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

test("both comparison routes open with no pair chosen: the picker, a one-line prompt and the rankings", async () => {
  const english = renderToStaticMarkup(await EnglishComparePage({ searchParams: Promise.resolve({}) }));
  const french = renderToStaticMarkup(await FrenchComparePage({ searchParams: Promise.resolve({}) }));
  for (const html of [english, french]) {
    assert.match(html, /<select name="left"><option value="" selected="">/);
    assert.match(html, /<select name="right"><option value="" selected="">/);
    assert.equal((html.match(/ selected=""/g) ?? []).length, 2, "only the two empty options are selected");
    assert.doesNotMatch(html, /option value="federal-(?!24|35|48|59)/);
    assert.equal((html.match(/class="comparison-prompt"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /comparison-side-by-side|comparison-card--empty/, "no empty comparison under the prompt");
    assert.ok(html.indexOf("comparison-prompt") < html.indexOf('class="comparison-table"'), "the prompt comes before the rankings");
    assert.equal((html.match(/class="comparison-table"/g) ?? []).length, 1, "one ranking: the federal one");
  }
  assert.match(english, /Choose two ridings in the fields above to compare them, or start from the rankings below\./);
  assert.match(french, /Choisissez deux circonscriptions dans les champs ci-dessus pour les comparer, ou partez des classements ci-dessous\./);
  assert.match(english, /Abbotsford—South Langley/, "the federal ranking is shown");
});

test("a link naming one riding fills that side only and leaves the other to the reader", async () => {
  const [english, french] = await render({ left: "federal-59006" });
  for (const html of [english, french]) {
    assert.match(html, /option value="federal-59006" selected/);
    assert.match(html, /<select name="right"><option value="" selected="">/);
    assert.match(html, /comparison-card--empty/);
    assert.doesNotMatch(html, /class="comparison-prompt"/);
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
  const outside = federalRidingComparison.outside[0]!;
  const [away, loin] = await render({ left: outside.id, right: "federal-59006" });
  assert.match(away, new RegExp(`Left side: ${outside.name.en} is a federal riding outside the four provinces the record covers, so it can’t be compared here\\.`));
  assert.match(loin, new RegExp(`Côté gauche\u202F: ${outside.name.fr} est une circonscription fédérale située hors des quatre provinces`));
});

test("a federal riding sits beside a provincial one, each labelled, each with its own ranking under its tab", async () => {
  const [english, french] = await render({ left: "federal-59001", right: "provincial-BC-258" });
  const [englishProvincial, frenchProvincial] = await render({ left: "federal-59001", right: "provincial-BC-258", rank: "provincial" });
  for (const html of [english, french]) {
    assert.match(html, /option value="provincial-BC-258" selected=""/);
    assert.doesNotMatch(html, /role="status"/);
    assert.match(html, /id="rankings-federal"/, "a pair with a federal riding opens on the federal tab");
    assert.doesNotMatch(html, /id="rankings-(BC|AB|ON|QC)"/);
    const comparison = html.slice(html.indexOf('class="comparison-side-by-side"'), html.indexOf('class="comparison-table"'));
    assert.ok(comparison.indexOf("Abbotsford—South Langley") < comparison.indexOf("Abbotsford-Mission"));
  }
  for (const html of [englishProvincial, frenchProvincial]) {
    assert.match(html, /id="rankings-BC"/, "the provincial tab shows the chosen provincial riding's province");
    assert.doesNotMatch(html, /id="rankings-(federal|AB|ON|QC)"/);
  }
  assert.match(english, /Federal riding · British Columbia/);
  assert.match(english, /Provincial riding · British Columbia/);
  assert.match(french, /Circonscription fédérale · Colombie-Britannique/);
  assert.match(french, /Circonscription provinciale · Colombie-Britannique/);
  assert.match(english, /<h2 id="rankings-federal-heading">Federal ridings in the four provinces<\/h2>/);
  assert.match(englishProvincial, /<h2 id="rankings-BC-heading">Provincial ridings in British Columbia<\/h2>/);
  assert.match(french, /<h2 id="rankings-federal-heading">Circonscriptions fédérales des quatre provinces<\/h2>/);
  assert.match(frenchProvincial, /<h2 id="rankings-BC-heading">Circonscriptions provinciales de la Colombie-Britannique<\/h2>/);
  assert.match(englishProvincial, /53 of British Columbia’s 93 provincial ridings are ranked\./);
  assert.match(frenchProvincial, /53 des 93 circonscriptions provinciales de la Colombie-Britannique sont classées\./);
  assert.match(english, /42 of 280 federal ridings are ranked\./);

  const [table] = await render({ left: "provincial-QC-137", right: "provincial-ON-89", view: "table" });
  assert.match(table, /Provincial riding · Québec/);
  assert.match(table, /Provincial riding · Ontario/);
  assert.doesNotMatch(table, /id="rankings-federal"/, "two provincial ridings open on the provincial tab, with only their provinces");
  assert.doesNotMatch(table, /id="rankings-(BC|AB)"/);
  assert.ok(table.indexOf('id="rankings-ON"') < table.indexOf('id="rankings-QC"'), "provinces in their west-to-east order");
});

test("provincial ridings rank only within their own province, with their own counts", () => {
  const expected = { BC: [93, 53], AB: [87, 8], ON: [124, 11], QC: [127, 26] } as const;
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

  const [federal, bc] = comparisonRankings([rankRidings(federalRidingComparison.comparisonRows).ranked[0], provincialRidingComparison.rowsByProvince.BC[0]]);
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
  assert.match(english, /53 of British Columbia’s 93 provincial ridings are ranked\. Of the rest, 2 were not mapped at all, 7 were only partly mapped, and 31 have less than 500 hectares of forest\./);
  const alberta = { rows: provincialRidingComparison.rowsByProvince.AB, context: provincialRidingComparison.contexts.AB, scope: { level: "provincial" as const, province: "AB" as const } };
  assert.match(renderToStaticMarkup(<RankedRidingsTable {...alberta} locale="en" />), /8 of Alberta’s 87 provincial ridings are ranked\. Of the rest, 79 were only partly mapped\./);
  assert.match(renderToStaticMarkup(<RankedRidingsTable {...alberta} locale="fr" />), /8 des 87 circonscriptions provinciales de l’Alberta sont classées\. Parmi les autres, 79 ne l’ont été qu’en partie\./);
});

test("Compare shows the first 20 of each ranking until the reader asks for all of it", async () => {
  const [english, french] = await render({ left: "federal-59001", right: "provincial-BC-258" });
  const [englishProvincial, frenchProvincial] = await render({ left: "federal-59001", right: "provincial-BC-258", rank: "provincial" });
  const federal = (html: string) => html.slice(html.indexOf('id="rankings-federal"'));
  for (const html of [english, french]) {
    assert.equal((federal(html).match(/<th scope="row">/g) ?? []).length, 20);
    assert.doesNotMatch(federal(html), /comparison-unranked/);
    assert.match(federal(html), /href="\?sort=share-desc&amp;left=federal-59001&amp;right=provincial-BC-258&amp;view=cards&amp;rankings=all#rankings-federal"/);
  }
  assert.match(federal(english), /Showing the first 20 of 42 ranked ridings\. The 238 not ranked are listed with the whole ranking\./);
  assert.match(federal(english), />Show all 280 federal ridings<\/a>/);
  assert.match(federal(french), /Les 20 premières des 42 circonscriptions classées sont affichées\. Les 238 circonscriptions non classées figurent dans la liste complète\./);
  assert.match(federal(french), />Afficher les 280 circonscriptions fédérales<\/a>/);
  assert.match(englishProvincial, />Show all 93 provincial ridings in British Columbia<\/a>/);
  assert.match(frenchProvincial, />Afficher les 93 circonscriptions provinciales de la Colombie-Britannique<\/a>/);

  const [all, tout] = await render({ left: "federal-59001", right: "provincial-BC-258", rankings: "all" });
  const [allProvincial, toutProvincial] = await render({ left: "federal-59001", right: "provincial-BC-258", rankings: "all", rank: "provincial" });
  for (const html of [allProvincial, toutProvincial]) {
    assert.equal((html.slice(html.indexOf('id="rankings-BC"')).match(/<th scope="row">/g) ?? []).length, 93);
    assert.doesNotMatch(html, /comparison-ranking-more/);
  }
  for (const html of [all, tout]) {
    assert.equal((federal(html).match(/<th scope="row">/g) ?? []).length, 280);
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

test("the rankings have three tabs, chosen by rank= and anchored at #rankings, in both languages", async () => {
  const labels = {
    en: ["Federal ridings", "Provincial ridings", "Cities"],
    fr: ["Circonscriptions fédérales", "Circonscriptions provinciales", "Villes"],
  } as const;
  for (const rank of ["federal", "provincial", "cities"] as const) {
    const [english, french] = await render({ rank });
    for (const [locale, html] of [["en", english], ["fr", french]] as const) {
      assert.equal((html.match(/<section class="comparison-rankings" id="rankings"/g) ?? []).length, 1, "one #rankings section");
      const nav = html.slice(html.indexOf('class="segment comparison-rank-tabs"'), html.indexOf("</nav>", html.indexOf("comparison-rank-tabs")));
      ["federal", "provincial", "cities"].forEach((tab, index) => {
        const current = tab === rank ? ' aria-current="page"' : "";
        assert.ok(nav.includes(`<a class="segment-option" href="?rank=${tab}#rankings"${current}>${labels[locale][index]}</a>`), `${locale} ${rank}: tab ${tab}`);
      });
      assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1);
      assert.match(html, /name="rank" value="/, "the picker keeps the named tab");
    }
    if (rank === "federal") {
      for (const html of [english, french]) {
        assert.match(html, /id="rankings-federal"/);
        assert.doesNotMatch(html, /id="rankings-(BC|AB|ON|QC)"|id="cities-most-lost"/);
      }
    } else if (rank === "provincial") {
      for (const html of [english, french]) {
        assert.doesNotMatch(html, /id="rankings-federal"|id="cities-most-lost"/);
        const order = ["BC", "AB", "ON", "QC"].map((province) => html.indexOf(`id="rankings-${province}"`));
        assert.ok(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1]!)), "with no riding chosen, all four provinces, west to east");
      }
    } else {
      for (const html of [english, french]) {
        assert.doesNotMatch(html, /id="rankings-(federal|BC|AB|ON|QC)"/);
        assert.match(html, /id="cities-most-lost"/);
      }
      // The cities tab is the home page's ranking, with its rules for which cities qualify.
      assert.ok(english.includes(renderToStaticMarkup(<CitiesMostLost locale="en" />)));
      assert.ok(french.includes(renderToStaticMarkup(<CitiesMostLost locale="fr" />)));
    }
  }
  // Tabs keep the chosen pair, view, sort and length; an unknown rank falls back as no rank does.
  const [kept] = await render({ left: "federal-59001", right: "federal-59006", view: "table", sort: "share-asc", rankings: "all", rank: "cities" });
  assert.ok(kept.includes('href="?left=federal-59001&amp;right=federal-59006&amp;view=table&amp;sort=share-asc&amp;rankings=all&amp;rank=provincial#rankings"'));
  const [unknown] = await render({ rank: "towns" });
  assert.match(unknown, /id="rankings-federal"/);
  assert.doesNotMatch(unknown, /name="rank"/, "an unknown tab is not carried into the picker");
  assert.match(unknown, /href="\?rank=federal#rankings" aria-current="page"/);
});

test("without a rank the chosen ridings pick the tab, and the sort and show-all links keep it once the page loads", async () => {
  assert.equal(parseRankingTab(undefined, [null, null]), "federal");
  assert.equal(parseRankingTab("cities", [null, null]), "cities");
  assert.equal(parseRankingTab("nonsense", [null, null]), "federal");
  const bc = provincialRidingComparison.rowsByProvince.BC[0]!;
  const federal = federalRidingComparison.comparisonRows[0]!;
  assert.equal(parseRankingTab(undefined, [bc, null]), "provincial");
  assert.equal(parseRankingTab(undefined, [bc, federal]), "federal");
  assert.equal(parseRankingTab("federal", [bc, null]), "federal");
  const source = readFileSync(new URL("../components/comparison/KeepRankInLinks.tsx", import.meta.url), "utf8");
  assert.match(source, /^"use client";/);
  assert.match(source, /main a\[href\^="\?"\]/);
  assert.match(source, /if \(query\.has\("rank"\)\) continue;/);
});
