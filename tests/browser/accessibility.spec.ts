import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { THEME_STORAGE_KEY } from "../../lib/theme";

const routes = ["/en", "/fr", "/en/explore", "/fr/explorer", "/en/compare", "/fr/comparer", "/en/explore?data=table", "/fr/explorer?data=table", "/en/compare?view=table", "/fr/comparer?view=table"];
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const route of routes) {
  test(`WCAG 2.2 AA ${route}`, async ({ page, colorScheme }, info) => {
    const theme = colorScheme === "dark" ? "dark" : "light";
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_STORAGE_KEY, value: theme });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", route.startsWith("/fr") ? "fr" : "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(`.theme-option input[value="${theme}"]`)).toBeEnabled();
    await expect(page.locator(`.theme-option input[value="${theme}"]`)).toBeChecked();
    await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page }).withTags(wcag).analyze();
    await info.attach("accessibility-evidence", {
      body: JSON.stringify({ status: result.violations.length ? "failed" : "passed", route, theme,
        viewport: page.viewportSize(), capturedAt: result.timestamp, engine: result.testEngine,
        tags: wcag, violations: result.violations, incomplete: result.incomplete,
        claims: { externalAudit: false, accessibilityConformance: false, phase8CriterionPass: false } }, null, 2),
      contentType: "application/json",
    });
    await info.attach("rendered-viewport", { body: await page.screenshot(), contentType: "image/png" });
    const layout = await page.evaluate(() => {
      const smallText = [...document.body.querySelectorAll("*")].flatMap((element) => {
        if (element.closest("script, style, noscript, title, .sr-only") ||
          ![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return [];
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (!box.width || !box.height || style.visibility === "hidden" || style.display === "none") return [];
        const matrix = element instanceof SVGGraphicsElement ? element.getScreenCTM() : null;
        const pixels = parseFloat(style.fontSize) * (matrix ? Math.hypot(matrix.c, matrix.d) : 1);
        return pixels < 11.99 ? [{ tag: element.tagName, className: element.getAttribute("class"), pixels,
          text: element.textContent?.trim().slice(0, 80) }] : [];
      });
      return { documentWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, smallText };
    });
    await info.attach("responsive-page-evidence", { body: JSON.stringify({ route, theme, ...layout }), contentType: "application/json" });
    expect.soft(layout.documentWidth, `${route}: page must not scroll sideways`).toBeLessThanOrEqual(layout.viewport + 1);
    expect.soft(layout.smallText, `${route}: visible text must render at 12 px or larger, including scaled SVG text`).toEqual([]);
    for (const region of await page.locator(".table-scroll").all()) {
      await expect(region).toHaveAttribute("tabindex", "0");
      await expect(region).toHaveAttribute("role", "region");
      await expect(region).toHaveAccessibleName(/.+/);
      await region.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(region).toBeFocused();
      const outline = await region.evaluate((element) => ({ width: parseFloat(getComputedStyle(element).outlineWidth), style: getComputedStyle(element).outlineStyle }));
      expect(outline.width).toBeGreaterThanOrEqual(2);
      expect(outline.style).toBe("solid");
      if (await region.evaluate((element) => element.scrollWidth > element.clientWidth + 1)) {
        await region.evaluate((element) => { element.scrollLeft = 0; });
        await page.keyboard.press("ArrowRight");
        await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      }
    }
    expect(result.violations, `${route} ${theme}: ${result.violations.map((item) => item.id).join(", ")}`).toEqual([]);
  });
}
