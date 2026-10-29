import { test, expect } from "@playwright/test";

/*
 * Every request the Explore page makes on its own, from navigation to a drawn
 * map, has to succeed. The analytics script used to be requested from
 * /_vercel/insights on every host, and only Vercel serves that path, so each
 * local or CI run of the page logged a 404 and a refused script.
 *
 * MapLibre cancels tile reads it no longer needs, so an aborted archive range
 * is not a failure. Anything else is.
 */
for (const route of ["/en/explore", "/fr/explorer"] as const) {
  test(`no failed requests on ${route}`, async ({ page }, info) => {
    const failures: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "";
      if (reason === "net::ERR_ABORTED" && /\.pmtiles(?:\?.*)?$/.test(request.url())) return;
      failures.push(`${reason} ${request.url()}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error" && /Failed to load resource/.test(message.text())) failures.push(message.text());
    });
    expect((await page.goto(route))?.status()).toBe(200);
    // The legend is in the server's HTML, so it is there before the map is.
    await expect(page.locator(".explore-map-layer-panel")).toBeVisible();
    await expect(page.locator(".explore-map")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await info.attach("explore-request-failures", { body: JSON.stringify({ route, failures }, null, 2), contentType: "application/json" });
    expect(failures).toEqual([]);
  });
}
