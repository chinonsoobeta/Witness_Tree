import { test, expect, type Frame, type Page } from "@playwright/test";
import { EMBED_SIZE } from "../../lib/embed/paths";

/*
 * Feature plan item 3, in a browser. A page on another origin frames a place's
 * embed and its place page side by side: the embed renders inside the frame,
 * whole at the snippet's size, and the place page is refused by the browser.
 * The other origin is served by request interception, so nothing leaves the
 * machine; the frames load from the production server under test.
 */

const EMBEDDER = "http://embedder.test/";
const SERVER = "http://127.0.0.1:4173";

const CASES = [
  // Campbell River, a fully measured community.
  { embed: "/en/embed/1984-2022-v1/csd-2021/5924034", page: "/en/places/1984-2022-v1/csd-2021/5924034", heading: "Campbell River", link: /Full record for Campbell River/ },
  // The longest embed text, in French, and the longest Unknown one.
  { embed: "/fr/integrer/1984-2022-v1/ab-2019/80", page: "/fr/lieux/1984-2022-v1/ab-2019/80", heading: null, link: /Registre complet de / },
  { embed: "/fr/integrer/1984-2022-v1/csd-2021/2421015", page: "/fr/lieux/1984-2022-v1/csd-2021/2421015", heading: null, link: /Registre complet de / },
] as const;

async function frameEmbedder(page: Page, embed: string, placePage: string) {
  await page.route(EMBEDDER, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!DOCTYPE html><html lang="en"><head><title>Another site</title></head><body style="margin:8px">
<iframe id="embed" src="${SERVER}${embed}" title="Embedded figure" width="${EMBED_SIZE.width}" height="${EMBED_SIZE.height}" style="border:0;max-width:100%"></iframe>
<iframe id="page" src="${SERVER}${placePage}" title="Place page" width="560" height="200"></iframe>
</body></html>`,
  }));
  await page.goto(EMBEDDER, { waitUntil: "load" });
}

function childFrame(page: Page, id: string): Promise<Frame> {
  return page.locator(`iframe#${id}`).elementHandle().then(async (handle) => {
    const frame = await handle?.contentFrame();
    if (!frame) throw new Error(`iframe#${id} has no frame`);
    return frame;
  });
}

for (const { embed, page: placePage, heading, link } of CASES) {
  test(`another origin can frame ${embed}, and its place page refuses`, async ({ page }) => {
    await frameEmbedder(page, embed, placePage);

    const figure = page.frameLocator("iframe#embed");
    const card = figure.locator("article.embed");
    await expect(card).toHaveAttribute("data-version", "1984-2022-v1");
    if (heading) await expect(figure.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(card).toHaveAccessibleName(/\S/);
    const back = figure.getByRole("link", { name: link });
    await expect(back).toHaveAttribute("href", `https://www.witnesstree.ca${placePage}`);
    await expect(back).toHaveAttribute("target", "_blank");
    await expect(figure.getByText("1984-2022-v1", { exact: true })).toBeVisible();

    // Where the frame has the snippet's full width, the whole card fits its
    // height: the attribution and licence line are inside the frame, not cut off.
    const frame = await childFrame(page, "embed");
    const box = await page.locator("iframe#embed").boundingBox();
    if (box && box.width >= EMBED_SIZE.width) {
      expect(await frame.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    }
    expect(await frame.evaluate(() => document.scripts.length)).toBe(0);

    // The place page keeps X-Frame-Options: DENY and frame-ancestors 'none', so
    // the browser shows its own error in place of the page.
    const refused = await childFrame(page, "page");
    expect(refused.url()).not.toBe(`${SERVER}${placePage}`);
    expect(await refused.evaluate(() => document.querySelector("main#main"))).toBeNull();
  });
}
