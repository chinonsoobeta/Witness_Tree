import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

/*
 * Exports a time-lapse from a production build: pins a federal riding in
 * British Columbia, asks for two annual intervals, and reads the downloaded
 * files back. The map draws from the published tile archives, so this needs
 * the network, like the map itself.
 */


const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function chunks(bytes: Buffer) {
  const out: { type: string; data: Buffer }[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    out.push({ type: bytes.toString("latin1", offset + 4, offset + 8), data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return out;
}

async function pinRiding(page: Page) {
  await page.goto("/en/explore?from=2021&year=2022&overlays=federal-ridings");
  await expect(page.locator('.explore-map[data-state="ready"][data-map-source="pmtiles"]')).toBeVisible({ timeout: 60_000 });
  await page.locator(".province-bar--map").getByRole("button", { name: "British Columbia" }).click();
  // Let the camera settle on the province before pointing at it.
  await page.waitForTimeout(1500);
  const canvas = page.locator(".explore-map-canvas canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.55, y: box.height * 0.6 } });
  const open = page.getByRole("button", { name: "Download the years as an animation" });
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.getByRole("heading", { name: "Download the years as an animation" })).toBeFocused();
  await page.locator('select[name="timelapse-from"]').selectOption("2020");
  await page.locator('select[name="timelapse-to"]').selectOption("2022");
}

async function exportAs(page: Page, format: RegExp) {
  await page.getByRole("radio", { name: format }).check();
  const download = page.waitForEvent("download", { timeout: 150_000 });
  await page.getByRole("button", { name: "Make the file" }).click();
  const file = await download;
  await expect(page.locator(".explore-timelapse-status")).toContainText("Saved ");
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

async function decodedSize(page: Page, bytes: Buffer) {
  return page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: "image/png" }));
    return [bitmap.width, bitmap.height];
  }, bytes.toString("base64"));
}

test("a pinned riding exports two years as an animated PNG, a contact sheet and a WebM", async ({ page }) => {
  // One layout is enough to exercise the export; the frame-size cap is unit tested.
  test.skip(test.info().project.name !== "1280-light", "Runs once, at 1280 px in the light scheme.");
  test.setTimeout(300_000);
  await pinRiding(page);

  const apng = await exportAs(page, /^Animated PNG/);
  expect(apng.name).toMatch(/^[a-z0-9-]+-federal-ridings-2020-2022\.png$/);
  expect([...apng.bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  const parts = chunks(apng.bytes);
  expect(parts[0]!.type).toBe("IHDR");
  expect(parts[1]!.type).toBe("acTL");
  expect(parts[1]!.data.readUInt32BE(0)).toBe(2);
  expect(parts.filter((part) => part.type === "fcTL")).toHaveLength(2);
  expect(parts.at(-1)!.type).toBe("IEND");
  // Two frames of a map at most 1280 px across with its strip: tens of kilobytes at least, a few megabytes at most.
  expect(apng.bytes.length).toBeGreaterThan(20_000);
  expect(apng.bytes.length).toBeLessThan(8_000_000);
  const [width, height] = await decodedSize(page, apng.bytes);
  expect(width).toBe(parts[0]!.data.readUInt32BE(0));
  expect(height).toBe(parts[0]!.data.readUInt32BE(4));
  expect(width).toBeLessThanOrEqual(1280);
  console.log(`APNG ${apng.name}: ${apng.bytes.length} bytes, ${width} x ${height}`);

  const sheet = await exportAs(page, /^Contact sheet/);
  expect(sheet.name).toMatch(/-federal-ridings-2020-2022-sheet\.png$/);
  expect([...sheet.bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(chunks(sheet.bytes).some((part) => part.type === "acTL")).toBe(false);
  const [sheetWidth] = await decodedSize(page, sheet.bytes);
  expect(sheetWidth).toBe(width);
  console.log(`Contact sheet ${sheet.name}: ${sheet.bytes.length} bytes`);

  const webm = await exportAs(page, /^WebM video/);
  expect(webm.name).toMatch(/-federal-ridings-2020-2022\.webm$/);
  // The EBML magic number every WebM file opens with.
  expect([...webm.bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  expect(webm.bytes.length).toBeGreaterThan(1_000);
  console.log(`WebM ${webm.name}: ${webm.bytes.length} bytes`);
});
