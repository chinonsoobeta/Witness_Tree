import { handleSearchSuggest } from "@/worker/search-suggest";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response | Promise<Response> {
  return handleSearchSuggest(request);
}
