import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { THEME_STORAGE_KEY } from "../../lib/theme";

const routes = ["/en", "/fr", "/en/explore", "/fr/explorer", "/en/compare", "/fr/comparer"];
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
    expect(result.violations, `${route} ${theme}: ${result.violations.map((item) => item.id).join(", ")}`).toEqual([]);
  });
}
