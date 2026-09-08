import { createHash } from "node:crypto";
import { test, expect, type Route } from "@playwright/test";
import { EXPLORE_PRODUCTION_LAYER } from "../../lib/explore/map-style";
import { AVAILABLE_BOUNDARY_OVERLAYS } from "../../lib/explore/boundaries";
import { THEME_STORAGE_KEY } from "../../lib/theme";

let publishedFallback: Buffer;
test.beforeAll(async ({ request }) => {
  const response = await request.get(EXPLORE_PRODUCTION_LAYER.compatibilityGeoJsonUrl);
  expect(response.status()).toBe(200);
  publishedFallback = await response.body();
  expect(createHash("sha256").update(publishedFallback).digest("hex")).toBe(EXPLORE_PRODUCTION_LAYER.compatibilityGeoJsonSha256);
});

for (const locale of ["en", "fr"] as const) {
  for (const failure of ["error", "timeout", "both-maps-unavailable"] as const) {
    test(`fallback and keyboard retry ${locale} ${failure}`, async ({ page, colorScheme }, info) => {
      const theme = colorScheme === "dark" ? "dark" : "light";
      const route = locale === "en" ? "/en/explore" : "/fr/explorer";
      const pending: Route[] = [];
      let retrying = false;
      let tileRequests = 0;
      let fallbackRequests = 0;
      await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_STORAGE_KEY, value: theme });
      // Fault injection exercises the real client and the exact published static
      // bytes. It is not evidence of a live outage or successful tile delivery.
      await page.route(/\.pmtiles(?:\?.*)?$/, async (request) => {
        tileRequests += 1;
        if (failure === "timeout" || retrying) pending.push(request);
        else await request.abort("failed");
      });
      await page.route(EXPLORE_PRODUCTION_LAYER.compatibilityGeoJsonUrl, async (request) => {
        fallbackRequests += 1;
        await request.fulfill(failure === "both-maps-unavailable"
          ? { status: 503, body: "Unavailable in this fault-injection test" }
          : { status: 200, contentType: "application/geo+json", body: publishedFallback });
      });
      expect((await page.goto(route))?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const map = page.locator(".explore-map");
      const canvas = page.locator(".explore-map-canvas");
      const status = page.locator(".explore-map-status");
      const figures = page.locator(".explore-map-data table");
      const before = await figures.innerText();
      expect(before).toContain(locale === "en" ? "Some pixels unknown" : "Certains pixels sont inconnus");
      const expectedState = failure === "both-maps-unavailable" ? "error" : "ready";
      await expect(map).toHaveAttribute("data-state", expectedState);
      if (failure === "both-maps-unavailable") {
        await expect(page.locator(".explore-map-fallback")).toHaveCount(0);
        await expect(status).not.toContainText(locale === "en" ? "A static map is shown" : "Une carte statique est affichée");
      } else {
        await expect(map).toHaveAttribute("data-map-source", "geojson-fallback");
        await expect(page.locator(".explore-map-fallback path")).toHaveCount(EXPLORE_PRODUCTION_LAYER.rows.length);
        await expect(status).toContainText(locale === "en" ? "A static map is shown instead" : "Une carte statique est affichée à sa place");
      }
      await expect(status).toContainText(locale === "en" ? "The figures below are unaffected" : "Les chiffres ci-dessous restent inchangés");
      await expect(status).not.toContainText(/PMTiles|GeoJSON|compatibility/i);
      await expect(canvas).toHaveAttribute("inert", "");
      expect(await figures.innerText()).toBe(before);
      const retry = page.getByRole("button", { name: locale === "en" ? "Retry the interactive map" : "Réessayer la carte interactive", exact: true });
      await retry.scrollIntoViewIfNeeded();
      await retry.focus();
      await expect(retry).toBeFocused();
      await info.attach("fallback-before-retry", { body: await page.screenshot(), contentType: "image/png" });
      const attempts = tileRequests;
      const fallbackAttempts = fallbackRequests;
      retrying = true;
      await page.keyboard.press("Enter");
      await expect.poll(() => tileRequests).toBeGreaterThan(attempts);
      await expect(map).toHaveAttribute("data-state", "loading");
      await expect(canvas).toHaveAttribute("inert", "");
      // A hidden map's injected canvas must not acquire focus during retry.
      await expect(canvas.locator("canvas")).toHaveCount(1);
      expect(await canvas.locator("canvas").evaluateAll((elements) => elements.every((element) => {
        (element as HTMLElement).focus();
        return document.activeElement !== element;
      }))).toBe(true);
      if (failure !== "timeout") for (const request of pending.splice(0)) await request.abort("failed");
      await expect(map).toHaveAttribute("data-state", expectedState);
      expect(fallbackRequests).toBeGreaterThan(fallbackAttempts);
      expect(await figures.innerText()).toBe(before);
      await expect(retry).toBeVisible();
      await info.attach("fallback-retry-evidence", {
        body: JSON.stringify({ scope: "local-fault-injection", route, theme, viewport: page.viewportSize(), failure,
          tileRequests, fallbackRequests, staticMapSha256: EXPLORE_PRODUCTION_LAYER.compatibilityGeoJsonSha256,
          keyboardRetryObserved: true, figuresUnchanged: true, deployedObservation: false, admissionClaim: false }, null, 2),
        contentType: "application/json",
      });
    });
  }
}

for (const locale of ["en", "fr"] as const) {
  test(`responsive map controls ${locale}`, async ({ page, colorScheme }, info) => {
    const theme = colorScheme === "dark" ? "dark" : "light";
    const route = locale === "en" ? "/en/explore" : "/fr/explorer";
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_STORAGE_KEY, value: theme });
    await page.route(/\.pmtiles(?:\?.*)?$/, (request) => request.abort("failed"));
    await page.route(EXPLORE_PRODUCTION_LAYER.compatibilityGeoJsonUrl, (request) => request.fulfill({ status: 200, contentType: "application/geo+json", body: publishedFallback }));
    await page.goto(`${route}?${new URLSearchParams({ overlays: AVAILABLE_BOUNDARY_OVERLAYS.join(",") })}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".explore-map")).toHaveAttribute("data-map-source", "geojson-fallback");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".explore-map-layer-list li")).toHaveCount(2 + AVAILABLE_BOUNDARY_OVERLAYS.length);
    const layout = await page.evaluate(() => {
      const box = (element: Element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }; };
      const panel = document.querySelector(".explore-map-layer-panel")!;
      const nav = document.querySelector(".province-bar--map")!;
      const frame = document.querySelector(".explore-map")!;
      const overflow = [...document.querySelectorAll(".explore-map-layer-panel, .explore-map-layer-list, .explore-map-legend, .province-bar--map, .explore-annual dl")]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({ className: element.getAttribute("class"), scroll: element.scrollWidth, client: element.clientWidth }));
      const clippedItems = [...panel.querySelectorAll("li")].filter((element) => box(element).left < box(panel).left || box(element).right > box(panel).right);
      const dl = document.querySelector<HTMLElement>(".explore-annual dl")!;
      const previousWidth = dl.style.width;
      dl.style.width = "10rem";
      const smallContainer = { scroll: dl.scrollWidth, client: dl.clientWidth };
      dl.style.width = previousWidth;
      return { documentWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
        panel: box(panel), nav: box(nav), frame: box(frame), overflow, clippedItems: clippedItems.length, smallContainer,
        buttons: [...nav.querySelectorAll("button")].map(box) };
    });
    await info.attach("responsive-map-evidence", { body: JSON.stringify({ route, theme, ...layout }, null, 2), contentType: "application/json" });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.overflow).toEqual([]);
    expect(layout.clippedItems).toBe(0);
    expect(layout.smallContainer.scroll).toBeLessThanOrEqual(layout.smallContainer.client + 1);
    expect(layout.panel.top).toBeGreaterThanOrEqual(layout.nav.bottom + 4);
    expect(layout.panel.bottom).toBeLessThanOrEqual(layout.frame.bottom);
    if (page.viewportSize()!.width < 760) {
      expect(new Set(layout.buttons.map((button) => Math.round(button.top))).size).toBe(2);
    }
    const buttons = page.locator(".province-bar--map button");
    await expect(buttons).toHaveCount(4);
    await buttons.first().focus();
    await page.keyboard.press("Shift+Tab");
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press("Tab");
      await expect(buttons.nth(index)).toBeFocused();
      const rectangle = layout.buttons[index]!;
      expect(rectangle.left).toBeGreaterThanOrEqual(layout.nav.left);
      expect(rectangle.right).toBeLessThanOrEqual(layout.nav.right);
    }
    await info.attach("responsive-map-viewport", { body: await page.screenshot(), contentType: "image/png" });
  });
}
