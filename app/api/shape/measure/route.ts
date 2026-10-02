import { handleShapeMeasure } from "@/worker/shape";

export const dynamic = "force-dynamic";

export function POST(request: Request): Response | Promise<Response> {
  return handleShapeMeasure(request, { COARSE_GRID_BASE: process.env.COARSE_GRID_BASE });
}
