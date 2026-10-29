import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordPlacePage, recordPlaceMetadata } from "@/components/places/RecordPlacePage";
import { SiteShell } from "@/components/site";
import { placePageParams, placePageRecord } from "@/lib/place-pages";

type Params = Promise<{ dataVersion: string; geography: string; code: string }>;

// Une page par municipalité, circonscription et région économique, tirée des
// registres versés au dépôt. Le chemin porte la version des données et l’édition
// des limites, jamais le nom du produit, pour qu’une citation survive à un
// changement de nom.
export const dynamicParams = false;

export function generateStaticParams() {
  return placePageParams().map(({ dataVersion, geography, code }) => ({ dataVersion, geography, code }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { dataVersion, geography, code } = await params;
  const record = placePageRecord(dataVersion, geography, decodeURIComponent(code));
  return record ? recordPlaceMetadata("fr", record) : {};
}

export default async function FrenchPlaceRecordPage({ params }: Readonly<{ params: Params }>) {
  const { dataVersion, geography, code } = await params;
  const record = placePageRecord(dataVersion, geography, decodeURIComponent(code));
  if (!record) notFound();
  return <SiteShell locale="fr"><RecordPlacePage locale="fr" record={record} /></SiteShell>;
}
