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
