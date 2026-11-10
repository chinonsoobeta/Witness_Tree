import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RidingSheet, ridingSheetMetadata } from "@/components/places/RidingSheet";
import { placePageParams, placePageRecord } from "@/lib/place-pages";

type Params = Promise<{ dataVersion: string; geography: string; code: string }>;

// A one-page print sheet for every place with a page: communities, economic
// regions, and federal and provincial ridings. It has no site header or
// footer: it is the paper, and its toolbar links back to the place's page.
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
  return record ? ridingSheetMetadata("en", record) : {};
}

export default async function EnglishRidingSheetPage({ params }: Readonly<{ params: Params }>) {
  const { dataVersion, geography, code } = await params;
  const record = sheetRecord(dataVersion, geography, code);
  if (!record) notFound();
  return <RidingSheet locale="en" record={record} />;
}
