import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { provincialCauseByInterval, provincialCauseForInterval, provincialCauseWholeRecord } from "../lib/phase4/provincial-cause.ts";
// @ts-expect-error Node test runner needs extensions.
import { ExploreView } from "../components/explore/ExploreView.tsx";
// @ts-expect-error Node test runner needs extensions.
import { exploreFixtures } from "../lib/explore/index.ts";
// @ts-expect-error Node test runner needs extensions.
import { provincialMatchingTextEn } from "../lib/phase4/methods-matching-en.ts";
// @ts-expect-error Node test runner needs extensions.
import { provincialMatchingTextFr } from "../lib/phase4/methods-matching-fr.ts";
// @ts-expect-error Node test runner needs extensions.
import { formatNumber } from "../lib/domain/number.ts";

test("the loss with no national cause splits into provincial record kinds and the rest, exactly", () => {
  for (const breakdown of [provincialCauseWholeRecord(), provincialCauseForInterval("2021-2022"), provincialCauseForInterval("1984-1985")]) {
    assert.ok(breakdown);
    const parts = breakdown.harvestHectares + breakdown.fireHectares + breakdown.insectOrWindthrowHectares + breakdown.noRecordHectares;
    assert.ok(Math.abs(parts - breakdown.noNationalCauseHectares) < 0.05);
    assert.ok(breakdown.noRecordHectares > 0, "most loss with no national cause has no provincial record either");
  }
  const whole = provincialCauseWholeRecord();
  assert.equal(Math.round(whole.noNationalCauseHectares), 18879291);
  assert.equal(Math.round(whole.harvestHectares), 2244748);
  assert.equal(Math.round(whole.fireHectares), 1361551);
  assert.equal(provincialCauseForInterval("2022-2023"), null, "no interval beyond the record");
});

test("Explore explains the rest of the loss only in the forest-loss view", () => {
  const forest = renderToStaticMarkup(<ExploreView events={exploreFixtures} locale="en" mode="forest-change" year={2022} provincialCause={provincialCauseByInterval()} />);
  assert.match(forest, /In British Columbia and Québec, 348,007 ha of this year’s loss has no national cause\. Provincial records match 36,993 ha of it to harvest, 25,089 ha to fire and 616 ha to insects or windthrow; 285,309 ha has no provincial record either\./);
  assert.match(forest, /href="\/en\/methods#provincial-matching">How the matching works/);
  const french = renderToStaticMarkup(<ExploreView events={exploreFixtures} locale="fr" mode="forest-change" year={2022} provincialCause={provincialCauseByInterval()} />);
  assert.ok(french.includes(`En Colombie-Britannique et au Québec, ${formatNumber(348007, "fr", 0)} ha des pertes de cette année n’ont pas de cause nationale`));
  const harvest = renderToStaticMarkup(<ExploreView events={exploreFixtures} locale="en" mode="recorded-harvest" year={2022} provincialCause={provincialCauseByInterval()} />);
  assert.doesNotMatch(harvest, /no national cause/);
});

test("the methods page states the split in both languages", () => {
  assert.match(provincialMatchingTextEn(), /of the 18,879,291 ha of detected loss in British Columbia and Québec with no national cause, 11\.9% lies in changes matching a provincial harvest record, 7\.2% fire and 0\.2% insects or windthrow; 80\.7% has no provincial record either\./);
  assert.ok(provincialMatchingTextFr().includes(`des ${formatNumber(18879291, "fr", 0)} ha de pertes détectées en Colombie-Britannique et au Québec sans cause nationale, ${formatNumber(11.9, "fr", 1)}\u00A0% se trouvent`));
});
