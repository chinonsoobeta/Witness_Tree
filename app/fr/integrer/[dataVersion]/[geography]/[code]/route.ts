import { embedResponse, embedStaticParams } from "@/lib/embed/card";

// Le chiffre d’un lieu, qu’un autre site peut intégrer dans un cadre : la carte
// seule, sans navigation, sans mesure d’audience ni script (lib/embed/card.ts).
// next.config.ts permet à tout site d’encadrer ce chemin, et aucun autre.
// Produit pour chaque lieu, comme sa page.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return embedStaticParams();
}

export function GET(_request: Request, { params }: { params: Promise<{ dataVersion: string; geography: string; code: string }> }) {
  return embedResponse("fr", params);
}
