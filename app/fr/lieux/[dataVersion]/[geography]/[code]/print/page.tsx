import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RidingSheet, ridingSheetMetadata } from "@/components/places/RidingSheet";
import { placePageParams, placePageRecord } from "@/lib/place-pages";

type Params = Promise<{ dataVersion: string; geography: string; code: string }>;

// Une fiche imprimable d’une page pour chaque lieu qui a une page : lieux,
// régions économiques, circonscriptions fédérales et provinciales. Elle n’a ni
// en-tête ni pied de page du site : elle est la feuille, et sa barre d’outils
// renvoie à la page du lieu.
export const dynamicParams = false;

export function generateStaticParams() {
  return placePageParams().map(({ dataVersion, geography, code }) => ({ dataVersion, geography, code }));
}

function sheetRecord(dataVersion: string, geography: string, code: string) {
  return placePageRecord(dataVersion, geography, decodeURIComponent(code));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { dataVersion, geography, code } = await params;
  const record = sheetRecord(dataVersion, geography, code);
  return record ? ridingSheetMetadata("fr", record) : {};
}

export default async function FrenchRidingSheetPage({ params }: Readonly<{ params: Params }>) {
  const { dataVersion, geography, code } = await params;
  const record = sheetRecord(dataVersion, geography, code);
  if (!record) notFound();
  return <RidingSheet locale="fr" record={record} />;
}
