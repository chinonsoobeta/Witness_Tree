/**
 * Whether the address field exists at all.
 *
 * The worker knows if a key is configured; the page does not, and must not be
 * able to claim it does. So the worker stamps the answer on every inbound
 * request and the page reads it back, the same way the signed-in user is read
 * in app/chatgpt-auth.ts. A client that sends the header itself is overwritten
 * before the request reaches the page.
 *
 * An absent key means the field does not render. It does not mean a field that
 * renders and then fails, because a control that cannot work should not be
 * offered.
 */

import { headers } from "next/headers";

export const ADDRESS_FLAG_HEADER = "x-witness-tree-address";
export const ADDRESS_FLAG_ON = "on";
export const ADDRESS_FLAG_OFF = "off";

export async function addressLookupConfigured(): Promise<boolean> {
  const requestHeaders = await headers();
  return requestHeaders.get(ADDRESS_FLAG_HEADER) === ADDRESS_FLAG_ON;
}
