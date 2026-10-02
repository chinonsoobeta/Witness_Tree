import { handleAddressSearch } from "@/worker/address";

export const dynamic = "force-dynamic";

export function POST(request: Request): Response | Promise<Response> {
  return handleAddressSearch(request, {});
}
