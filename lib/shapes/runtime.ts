/**
 * Whether measuring a drawn area is possible at all.
 *
 * The worker knows whether the packed grid is reachable; the page does not,
 * and must not be able to claim it is. The worker stamps the answer on every
 * inbound request and the page reads it back, the same way the address and
 * district flags work. A client that sends the header itself is overwritten
 * before the request reaches the page.
 */

import { headers } from "next/headers";

export const SHAPE_FLAG_HEADER = "x-witness-tree-shape";
export const SHAPE_FLAG_ON = "on";
export const SHAPE_FLAG_OFF = "off";

export async function coarseGridAvailable(): Promise<boolean> {
  const requestHeaders = await headers();
  return requestHeaders.get(SHAPE_FLAG_HEADER) === SHAPE_FLAG_ON;
}
