import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RidingSheet, ridingSheetMetadata } from "@/components/places/RidingSheet";
import { isRidingGeography, placePageParams, placePageRecord } from "@/lib/place-pages";

type Params = Promise<{ dataVersion: string; geography: string; code: string }>;

// Une fiche imprimable d’une page pour chaque circonscription fédérale et
// provinciale qui a une page. Elle n’a ni en-tête ni pied de page du site :
// elle est la feuille, et sa barre d’outils renvoie à la page de la
// circonscription.
export const dynamicParams = false;

export function generateStaticParams() {
  return placePageParams()
    .filter(({ geography }) => isRidingGeography(geography))
    .map(({ dataVersion, geography, code }) => ({ dataVersion, geography, code }));
}

function ridingRecord(dataVersion: string, geography: string, code: string) {
  return isRidingGeography(geography) ? placePageRecord(dataVersion, geography, decodeURIComponent(code)) : undefined;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { dataVersion, geography, code } = await params;
  const record = ridingRecord(dataVersion, geography, code);
  return record ? ridingSheetMetadata("fr", record) : {};
}

export default async function FrenchRidingSheetPage({ params }: Readonly<{ params: Params }>) {
  const { dataVersion, geography, code } = await params;
  const record = ridingRecord(dataVersion, geography, code);
  if (!record) notFound();
  return <RidingSheet locale="fr" record={record} />;
}
