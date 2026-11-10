"use client";

import { useEffect } from "react";

/**
 * The ranking tables build their sort and "show all" links, and the comparison
 * its view link, from the chosen ridings alone, so a click would drop the
 * ranking tab the reader is on. This adds the tab to those same-page links once
 * the page has loaded. Without JavaScript the links still work and open the
 * tab the chosen ridings imply.
 */
export function KeepRankInLinks({ rank }: Readonly<{ rank: string }>) {
  useEffect(() => {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('main a[href^="?"]')) {
      const href = link.getAttribute("href") ?? "";
      const hashAt = href.indexOf("#");
      const query = new URLSearchParams(hashAt === -1 ? href.slice(1) : href.slice(1, hashAt));
      if (query.has("rank")) continue;
      query.set("rank", rank);
      link.setAttribute("href", `?${query.toString()}${hashAt === -1 ? "" : href.slice(hashAt)}`);
    }
  }, [rank]);
  return null;
}
