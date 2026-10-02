import { handleDistrictSpans } from "@/worker/district-spans";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response | Promise<Response> {
  return handleDistrictSpans(request);
}
