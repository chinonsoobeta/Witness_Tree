import { embedResponse, embedStaticParams } from "@/lib/embed/card";

// A place's figure for another site to frame: the card alone, with no
// navigation, analytics or script (lib/embed/card.ts). next.config.ts lets any
// site frame this path and no other. Built for every place, like its page.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return embedStaticParams();
}

export function GET(_request: Request, { params }: { params: Promise<{ dataVersion: string; geography: string; code: string }> }) {
  return embedResponse("en", params);
}
