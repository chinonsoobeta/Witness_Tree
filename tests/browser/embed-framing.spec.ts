import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type Frame, type Page } from "@playwright/test";
import { EMBED_SIZE } from "../../lib/embed/paths";

/*
 * Feature plan item 3, in a browser. A page on another origin frames a place's
 * embed and its place page side by side: the embed renders inside the frame,
 * whole at the snippet's size, and the place page is refused by the browser.
 *
 * The other origin is a small server on localhost, a different host and port
 * from the production server under test, so nothing leaves the machine. It is
 * a real server rather than request interception because Chromium treats an
 * intercepted page as a public address, and its local-network-access rule then
 * blocks every frame of 127.0.0.1 before frame-ancestors is consulted.
 */

const SERVER = "http://127.0.0.1:4173";

const CASES = [
  // Campbell River, a fully measured community.
  { embed: "/en/embed/1984-2022-v1/csd-2021/5924034", page: "/en/places/1984-2022-v1/csd-2021/5924034", heading: "Campbell River", link: /Full record for Campbell River/ },
  // The longest embed text, in French, and the longest Unknown one.
  { embed: "/fr/integrer/1984-2022-v1/ab-2019/80", page: "/fr/lieux/1984-2022-v1/ab-2019/80", heading: null, link: /Registre complet de / },
  { embed: "/fr/integrer/1984-2022-v1/csd-2021/2421015", page: "/fr/lieux/1984-2022-v1/csd-2021/2421015", heading: null, link: /Registre complet de / },
] as const;

// GET /<case index> answers a page that frames that case's embed and place page.
let embedder: Server;
let embedderOrigin = "";

test.beforeAll(async () => {
  embedder = createServer((request, response) => {
    const chosen = CASES[Number(request.url?.slice(1))];
    if (!chosen) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!DOCTYPE html><html lang="en"><head><title>Another site</title></head><body style="margin:8px">
<iframe id="embed" src="${SERVER}${chosen.embed}" title="Embedded figure" width="${EMBED_SIZE.width}" height="${EMBED_SIZE.height}" style="border:0;max-width:100%"></iframe>
<iframe id="page" src="${SERVER}${chosen.page}" title="Place page" width="560" height="200"></iframe>
</body></html>`);
  });
  await new Promise<void>((resolve) => embedder.listen(0, "localhost", resolve));
  embedderOrigin = `http://localhost:${(embedder.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => embedder.close(resolve));
});

function childFrame(page: Page, id: string): Promise<Frame> {
  return page.locator(`iframe#${id}`).elementHandle().then(async (handle) => {
    const frame = await handle?.contentFrame();
    if (!frame) throw new Error(`iframe#${id} has no frame`);
    return frame;
  });
}

for (const [index, { embed, page: placePage, heading, link }] of CASES.entries()) {
  test(`another origin can frame ${embed}, and its place page refuses`, async ({ page }) => {
    await page.goto(`${embedderOrigin}/${index}`, { waitUntil: "load" });

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
    // the browser shows its own error in place of the page. The embed beside it
    // loaded from the same server, so the refusal is the framing rule.
    const refused = await childFrame(page, "page");
    expect(refused.url()).not.toBe(`${SERVER}${placePage}`);
    expect(await refused.evaluate(() => document.querySelector("main#main"))).toBeNull();
  });
}
