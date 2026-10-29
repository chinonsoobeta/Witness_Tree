import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/*
 * The riding print sheet (feature plan item 2) prints to one page. Chromium's
 * PDF printer stands in for the reader's "Save as PDF": each sheet is printed
 * on Letter and on A4 and the PDF's pages are counted. The sample covers the
 * longest riding name, a figure that is a minimum, an admitted unknown share,
 * an Unknown loss, a provincial riding with no forest mapped, and both
 * languages, because those carry the longest wording.
 */

const SHEETS = [
  "/en/places/1984-2022-v1/federal-2023/24020/print",
  "/fr/lieux/1984-2022-v1/federal-2023/24020/print",
  "/en/places/1984-2022-v1/federal-2023/24001/print",
  "/fr/lieux/1984-2022-v1/federal-2023/24019/print",
  "/en/places/1984-2022-v1/on-2022/1/print",
  "/fr/lieux/1984-2022-v1/on-2022/1/print",
  "/en/places/1984-2022-v1/bc-2023/258/print",
  "/fr/lieux/1984-2022-v1/bc-2023/318/print",
  "/fr/lieux/1984-2022-v1/qc-2026/117/print",
];

/** Chromium writes one page object per page and no object streams. */
function pageCount(pdf: Buffer) {
  const text = pdf.toString("latin1");
  const pages = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((match) => Number(match[1]));
  return { pages, count: Math.max(0, ...counts) };
}

async function printed(page: Page, path: string, format: "Letter" | "A4") {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  return page.pdf({ format, printBackground: true });
}

test.describe("riding print sheet", () => {
  // Printing does not depend on the window or the theme, so one project prints.
  test.beforeEach(({ browserName }, info) => {
    test.skip(browserName !== "chromium" || info.project.name !== "1280-light", "printed once, in Chromium");
  });

  for (const path of SHEETS) {
    test(`prints ${path} on one Letter page and one A4 page`, async ({ page }) => {
      for (const format of ["Letter", "A4"] as const) {
        const pdf = await printed(page, path, format);
        expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        const { pages, count } = pageCount(pdf);
        expect(pages, `${path} ${format} page objects`).toBe(1);
        expect(count, `${path} ${format} page tree count`).toBe(1);
      }
    });
  }
});

test.describe("riding print sheet on screen", () => {
  test("the button opens the print dialog, and the toolbar is not printed", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => { (window as unknown as { printed: number }).printed += 1; };
    });
    await page.goto("/en/places/1984-2022-v1/federal-2023/24002/print");
    await page.getByRole("button", { name: "Print or save as PDF" }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".riding-sheet-toolbar")).toBeHidden();
    await expect(page.locator("h1")).toHaveText("Abitibi—Témiscamingue");
    await page.emulateMedia({ media: "screen" });
    await expect(page.getByRole("link", { name: "Back to the riding’s page" })).toHaveAttribute("href", "/en/places/1984-2022-v1/federal-2023/24002");
  });

  for (const path of ["/en/places/1984-2022-v1/federal-2023/24002/print", "/fr/lieux/1984-2022-v1/on-2022/1/print"]) {
    test(`WCAG 2.2 AA and no sideways scroll ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", path.startsWith("/fr") ? "fr" : "en");
      await page.evaluate(() => document.fonts.ready);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
      const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
      expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
    });
  }
});
