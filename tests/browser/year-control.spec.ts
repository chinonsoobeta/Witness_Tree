import { test, expect } from "@playwright/test";

async function typeYear(page: import("@playwright/test").Page, name: "from" | "year", value: string) {
  const select = page.locator(`select[name="${name}"]`);
  await select.focus();
  await page.keyboard.type(value);
}

async function expectSpan(page: import("@playwright/test").Page, from: string, year: string) {
  await expect.poll(() => {
    const params = new URL(page.url()).searchParams;
    return `${params.get("from")}:${params.get("year")}`;
  }).toBe(`${from}:${year}`);
}

test("keyboard type-ahead commits one shareable closing-year choice", async ({ page }) => {
  await page.goto("/en/explore?from=2021&year=2022");
  const before = await page.evaluate(() => history.length);
  await typeYear(page, "year", "1990");
  await expectSpan(page, "1989", "1990");
  await expect(page.getByText("Change between 1989 and 1990", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
});

test("keyboard type-ahead on the opening-year select keeps the closing year", async ({ page }) => {
  await page.goto("/en/explore?from=2021&year=2022");
  await typeYear(page, "from", "1990");
  await expectSpan(page, "1990", "2022");
});

test("reversing the span moves the other select and announces it", async ({ page }) => {
  await page.goto("/en/explore?from=1990&year=2000");
  await typeYear(page, "from", "2010");
  await expectSpan(page, "2010", "2011");
  await expect(page.locator(".year-order-status")).toContainText("Last year moved to 2011");
});

test("French keyboard type-ahead selects the same span", async ({ page }) => {
  await page.goto("/fr/explorer?from=2021&year=2022");
  await typeYear(page, "year", "1990");
  await expectSpan(page, "1989", "1990");
  await expect(page.getByText("Changement entre 1989 et 1990", { exact: true })).toBeVisible();
});

/*
 * B4 and B6 of the 2026-10-28 adversarial audit: Play starts at the first year
 * the reader chose, keeps it in the address on every step, and its accessible
 * name follows the word it shows.
 */
for (const [locale, route, play, pause, resume] of [
  ["en", "/en/explore", "Play year by year from 1990", "Pause playback", "Resume playback"],
  ["fr", "/fr/explorer", "Lecture année par année depuis 1990", "Mettre la lecture en pause", "Reprendre la lecture"],
] as const) {
  test(`Play holds the chosen first year and names its state ${locale}`, async ({ page }) => {
    await page.goto(`${route}?from=1990&year=2000`);
    await expect(page.locator(".explore-map")).toHaveAttribute("data-map-source", "pmtiles", { timeout: 30_000 });
    await page.getByRole("button", { name: play, exact: true }).click();
    await expectSpan(page, "1990", "1991");
    await expectSpan(page, "1990", "1992");
    const pauseButton = page.getByRole("button", { name: pause, exact: true });
    await expect(pauseButton).toHaveText("Pause");
    await pauseButton.click();
    const resumeButton = page.getByRole("button", { name: resume, exact: true });
    await expect(resumeButton).toHaveText(locale === "en" ? "Resume" : "Reprendre");
    const paused = new URL(page.url()).searchParams;
    expect(paused.get("from")).toBe("1990");
    expect(Number(paused.get("year"))).toBeGreaterThan(1991);
    await expect(page.locator(".year-play-status")).toContainText(locale === "en" ? "Paused." : "En pause.");
  });

  test(`Play waits for the map and pauses with a reason when the still map takes over ${locale}`, async ({ page }) => {
    // Tile reads hang, so the map stays loading until its timeout hands over to the still map.
    await page.route(/\.pmtiles(?:\?.*)?$/, () => {});
    await page.goto(`${route}?from=1990&year=2000`);
    await page.getByRole("button", { name: play, exact: true }).click();
    await expectSpan(page, "1990", "1991");
    await expect(page.locator(".year-play-status")).toContainText(locale === "en" ? "Waiting for the interactive map" : "En attente du chargement de la carte interactive");
    await expect(page.locator(".explore-map")).toHaveAttribute("data-map-source", "geojson-fallback", { timeout: 30_000 });
    const resumeButton = page.getByRole("button", { name: resume, exact: true });
    await expect(resumeButton).toBeDisabled();
    await expect(page.locator(".year-play-status")).toContainText(locale === "en" ? "the interactive map isn’t showing" : "la carte interactive ne s’affiche pas");
    // It did not step while the map was not drawing.
    await expectSpan(page, "1990", "1991");
    const notice = page.locator(".explore-map-notice--fallback");
    await expect(notice).toContainText(locale === "en" ? "a still map is shown instead" : "une carte fixe est donc affichée à sa place");
    await expect(notice).toContainText(locale === "en" ? "The still map shades each province for the years you chose." : "La carte fixe colore chaque province pour les années choisies.");
    await expect(notice.getByRole("button", { name: locale === "en" ? "Retry the interactive map" : "Réessayer la carte interactive", exact: true })).toBeVisible();
    // The figures are still there.
    await expect(page.locator(".explore-reading-figure")).toBeVisible();
  });

  /* UX 1: a phone opens on the map; wider screens keep the controls above it. */
  test(`Explore puts the map first on a phone ${locale}`, async ({ page }) => {
    await page.goto(route);
    const top = (selector: string) => page.locator(selector).first().evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    const [toolbar, canvas, map, reading] = await Promise.all([".explore-toolbar", ".explore-canvas", ".explore-map", ".explore-reading"].map(top));
    if (page.viewportSize()!.width < 760) {
      await expect(page.locator(".explore-map-readout")).toBeVisible();
      expect(canvas).toBeLessThan(map);
      expect(map).toBeLessThan(toolbar);
      expect(toolbar).toBeLessThan(reading);
    } else {
      await expect(page.locator(".explore-map-readout")).toBeHidden();
      expect(toolbar).toBeLessThan(map);
    }
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(1);
  });
}
