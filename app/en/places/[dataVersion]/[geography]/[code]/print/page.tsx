import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RidingSheet, ridingSheetMetadata } from "@/components/places/RidingSheet";
import { isRidingGeography, placePageParams, placePageRecord } from "@/lib/place-pages";

type Params = Promise<{ dataVersion: string; geography: string; code: string }>;

// A one-page print sheet for every federal and provincial riding with a page.
// It has no site header or footer: it is the paper, and its toolbar links back
// to the riding's page.
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
  return record ? ridingSheetMetadata("en", record) : {};
}

export default async function EnglishRidingSheetPage({ params }: Readonly<{ params: Params }>) {
  const { dataVersion, geography, code } = await params;
  const record = ridingRecord(dataVersion, geography, code);
  if (!record) notFound();
  return <RidingSheet locale="en" record={record} />;
}
