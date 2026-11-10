import { EXPLORE_MAP_VIEWS, type ExploreMapView } from "./types";

/*
 * C6: the province the reader chose on the map, carried in the address as
 * `province=bc` (one of bc, ab, on, qc). All four provinces is no parameter.
 * Anything else is ignored: the page opens on all four, as it always did.
 */
export const EXPLORE_PROVINCE_PARAM = "province";

export function readExploreProvince(value: string | readonly string[] | undefined): ExploreMapView | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (EXPLORE_MAP_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as ExploreMapView) : null;
}

/** The same address with the province set, or removed for all four. */
export function addressWithProvince(address: string, province: ExploreMapView | null): string {
  const url = new URL(address, "http://explore.invalid/");
  if (province) url.searchParams.set(EXPLORE_PROVINCE_PARAM, province);
  else url.searchParams.delete(EXPLORE_PROVINCE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/*
 * An address Explore writes for itself (a new span, an outline shown or
 * hidden) is built from the query state, which knows nothing of the province
 * or the map position. This carries both over from the address on display,
 * unless the new one names its own: the province parameter, and the hash that
 * holds the map position (D5).
 */
export function keepAddressState(next: string, current: Readonly<{ pathname: string; search: string; hash: string }>): string {
  const url = new URL(next, `http://explore.invalid${current.pathname}`);
  const province = readExploreProvince(new URLSearchParams(current.search).get(EXPLORE_PROVINCE_PARAM) ?? undefined);
  if (province && !url.searchParams.has(EXPLORE_PROVINCE_PARAM)) url.searchParams.set(EXPLORE_PROVINCE_PARAM, province);
  if (!url.hash && current.hash) url.hash = current.hash;
  return `${url.pathname}${url.search}${url.hash}`;
}
