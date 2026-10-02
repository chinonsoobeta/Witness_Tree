import { NextResponse, type NextRequest } from "next/server";

/** Overwrite feature flags before rendering, so callers cannot enable unavailable services. */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-witness-tree-address", "off");
  headers.set("x-witness-tree-district", process.env.DISTRICT_INDEX_BASE ? "on" : "off");
  headers.set("x-witness-tree-shape", process.env.COARSE_GRID_BASE ? "on" : "off");
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/en/:path*", "/fr/:path*"] };
