import { handleOembed } from "@/lib/embed/oembed";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return handleOembed(request);
}
