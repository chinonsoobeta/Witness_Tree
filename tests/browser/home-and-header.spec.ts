import { test, expect, type Page } from "@playwright/test";

/*
 * Two fixes from the 2026-10-28 audit that only a browser can show.
 *
 * The home field used to submit an empty query to a results page that then
 * asked for a place. It now keeps the reader on the home page, with focus in
 * the field and a hint under it, and a real query still submits as before.
 *
 * The header used to collapse into a Menu button below 1180px, at tablet
 * widths with room for the six links. From 800px the links show in full; the
 * French labels are the longer ones, so both languages are measured.
 */

const HINT = {
  en: "Enter a place first: a province, riding or community.",
  fr: "Entrez d’abord un lieu : une province, une circonscription ou une collectivité.",
} as const;

for (const locale of ["en", "fr"] as const) {
  test(`an empty home search stays on the page with a hint ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const form = page.locator(".home-search form");
    const field = form.locator("input[name=q]");
    const submit = form.locator("button[type=submit]");
    const hint = form.locator(".search-suggest-hint");
    // The theme control is server-rendered disabled and enabled on hydration, so
    // it marks the moment the field's submit handler is attached too.
    await expect(page.locator(".theme-option input").first()).toBeEnabled();
    await page.waitForLoadState("networkidle");
    await expect(hint).toHaveText("");

    await submit.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await expect(field).toBeFocused();
    await expect(hint).toHaveText(HINT[locale]);
    await expect(field).toHaveAttribute("aria-describedby", (await hint.getAttribute("id"))!);

    // Blank is empty too, and Enter takes the same path as the button.
    await field.fill("   ");
    await expect(hint).toHaveText("");
    await field.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await expect(hint).toHaveText(HINT[locale]);

    // A real query is untouched by the hint and opens the results page.
    await field.fill("Prince George");
    await expect(hint).toHaveText("");
    await expect(field).not.toHaveAttribute("aria-describedby");
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`/${locale === "en" ? "en/search" : "fr/recherche"}\\?q=Prince\\+George$`));
  });
}

async function headerLayout(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element | null) => {
      const box = element!.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
    };
    const toggle = document.querySelector(".nav-toggle")!;
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      toggleShown: getComputedStyle(toggle).display !== "none",
      links: [...document.querySelectorAll(".nav-panel a")].map(rect),
      controls: [...document.querySelectorAll(".wordmark, .nav-panel a, .theme-toggle, .locale-link")].map(rect),
    };
  });
}

for (const locale of ["en", "fr"] as const) {
  for (const width of [799, 800, 1000, 1179, 1180]) {
    test(`the header shows its links in full from 800px, without overlap ${locale} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/${locale}`);
      await page.evaluate(() => document.fonts.ready);
      const layout = await headerLayout(page);
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.toggleShown).toBe(width < 800);
      if (width < 800) return;
      expect(layout.links).toHaveLength(6);
      for (const link of layout.links) {
        expect(link.width).toBeGreaterThan(0);
        expect(link.right).toBeLessThanOrEqual(layout.viewport);
      }
      // No two header controls share a pixel.
      layout.controls.forEach((a, i) => layout.controls.slice(i + 1).forEach((b) => {
        const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        expect(overlap, JSON.stringify({ a, b })).toBe(false);
      }));
    });
  }
}
