import { NextResponse, type NextRequest } from "next/server";
import { canonicalLocaleRedirect } from "@/lib/locale-navigation";

/**
 * Send a near-miss page address (wrong letter case, or the other language's
 * slug) to its page with a permanent redirect that keeps the query string. Then
 * overwrite feature flags before rendering, so callers cannot enable unavailable
 * services.
 */
export function proxy(request: NextRequest) {
  const canonical = canonicalLocaleRedirect(request.nextUrl.pathname);
  if (canonical) {
    const url = request.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url, 308);
  }
  const headers = new Headers(request.headers);
  headers.set("x-witness-tree-address", "off");
  headers.set("x-witness-tree-district", process.env.DISTRICT_INDEX_BASE ? "on" : "off");
  headers.set("x-witness-tree-shape", process.env.COARSE_GRID_BASE ? "on" : "off");
  return NextResponse.next({ request: { headers } });
}

// The locale segment in any letter case, so `/EN` and `/Fr/...` reach the redirect.
export const config = { matcher: ["/:locale([eE][nN]|[fF][rR])/:path*"] };
