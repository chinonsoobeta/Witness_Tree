import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("current product-purpose surfaces describe a Canadian baseline and Big Four focus", async () => {
  const surfaces = await Promise.all([
    read("../app/page.tsx"),
    read("../lib/domain/brand.ts"),
    read("../README.md"),
    read("../components/site/SiteFooter.tsx"),
    read("../components/governance/GovernancePage.tsx"),
    read("../app/en/page.tsx"),
    read("../app/fr/page.tsx"),
  ]);

  const BigFourNames = [
    /British Columbia|Colombie-Britannique|BC|C\.-B\./,
    /Alberta|Alb\./,
    /Ontario|Ont\./,
    /Quebec|Québec|QC|Qc/,
  ];

  for (const surface of surfaces) {
    assert.match(surface, /Canada/i);
    for (const name of BigFourNames) assert.match(surface, name);
  }
});

test("current product-purpose surfaces do not retain the former four-province-only claim", async () => {
  const surfaces = await Promise.all([
    read("../app/page.tsx"),
    read("../lib/domain/brand.ts"),
    read("../README.md"),
    read("../components/governance/GovernancePage.tsx"),
    read("../app/en/page.tsx"),
    read("../app/fr/page.tsx"),
  ]);
  const formerEnglishClaim = "forest change in British Columbia, Alberta, Ontario and Quebec";
  const formerFrenchClaim = "changements forestiers en Colombie-Britannique, en Alberta, en Ontario et au Québec depuis 1984";
  const formerGatewayClaim = "forest change in four Canadian provinces";

  for (const surface of surfaces) {
    assert.equal(surface.includes(formerEnglishClaim), false);
    assert.equal(surface.includes(formerFrenchClaim), false);
    assert.equal(surface.includes(formerGatewayClaim), false);
  }
});
