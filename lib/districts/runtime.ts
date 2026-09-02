/**
 * Whether the district readout exists at all.
 *
 * The worker knows whether the index is reachable; the page does not, and must
 * not be able to claim it is. The worker stamps the answer on every inbound
 * request and the page reads it back, the same way lib/address/runtime.ts
 * reads the address flag. A client that sends the header itself is overwritten
 * before the request reaches the page.
 */

import { headers } from "next/headers";

export const DISTRICT_FLAG_HEADER = "x-witness-tree-district";
export const DISTRICT_FLAG_ON = "on";
export const DISTRICT_FLAG_OFF = "off";

export async function districtIndexAvailable(): Promise<boolean> {
  const requestHeaders = await headers();
  return requestHeaders.get(DISTRICT_FLAG_HEADER) === DISTRICT_FLAG_ON;
}
