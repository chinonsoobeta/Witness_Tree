import { test, expect } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../../lib/theme";

/*
 * The cumulative headline is the one figure the product exists to state, and
 * the whole argument of the block is that the number and the things that bound
 * it are read together. Two ways a browser can break that are invisible to a
 * server-rendered assertion, so they are measured here instead.
 *
 * The first is the figure splitting its unit onto its own line. "44 975 298,15"
 * above a lone "ha" reads as two facts, and French is the binding case because
 * its group separator is a space. The second is the block growing wider than
 * the page, which would put the basis off screen while leaving the number on it.
 */
for (const locale of ["en", "fr"] as const) {
  test(`the cumulative figure holds its unit on one line ${locale}`, async ({ page, colorScheme }, info) => {
    const theme = colorScheme === "dark" ? "dark" : "light";
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_STORAGE_KEY, value: theme });
    const response = await page.goto(locale === "en" ? "/en" : "/fr");
    expect(response?.status()).toBe(200);
    await page.evaluate(() => document.fonts.ready);

    const measured = await page.evaluate(() => {
      const figure = document.querySelector(".cumulative-figure");
      const block = document.querySelector(".cumulative-headline");
      if (!figure || !block) return null;
      // Client rects, one per rendered line box, so this counts what the
      // browser drew rather than what the stylesheet asked for.
      const range = document.createRange();
      range.selectNodeContents(figure);
      const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
      return {
        text: figure.textContent ?? "",
        lines: lines.length,
        fontSize: getComputedStyle(figure).fontSize,
        blockWidth: Math.round(block.getBoundingClientRect().width),
        documentWidth: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        // Every description in the block, so a basis that fell out is visible
        // here and not only in the server-rendered markup.
        bases: document.querySelectorAll(".cumulative-basis dd").length,
      };
    });

    await info.attach("cumulative-headline-evidence", {
      body: JSON.stringify({ locale, theme, viewport: page.viewportSize(), ...measured }, null, 2),
      contentType: "application/json",
    });

    expect(measured).not.toBeNull();
    expect(measured!.lines).toBe(1);
    expect(measured!.bases).toBe(3);
    expect(measured!.documentWidth).toBeLessThanOrEqual(measured!.viewport + 1);
    expect(measured!.blockWidth).toBeLessThanOrEqual(measured!.viewport);
  });
}
