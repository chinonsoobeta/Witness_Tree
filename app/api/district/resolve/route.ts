import { handleDistrictResolve } from "@/worker/district";

export const dynamic = "force-dynamic";

export function POST(request: Request): Response | Promise<Response> {
  return handleDistrictResolve(request, { DISTRICT_INDEX_BASE: process.env.DISTRICT_INDEX_BASE });
}
