import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordPlacePage, recordPlaceMetadata } from "@/components/places/RecordPlacePage";
import { SiteShell } from "@/components/site";
import { placePageParams, placePageRecord } from "@/lib/place-pages";

type Params = Promise<{ dataVersion: string; geography: string; code: string }>;

// One page per community, riding and economic region, built from the checked-in
// records. The path carries the data version and the boundary edition, never the
// product name, so a citation survives a rename.
export const dynamicParams = false;

export function generateStaticParams() {
  return placePageParams().map(({ dataVersion, geography, code }) => ({ dataVersion, geography, code }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { dataVersion, geography, code } = await params;
  const record = placePageRecord(dataVersion, geography, decodeURIComponent(code));
  return record ? recordPlaceMetadata("en", record) : {};
}

export default async function EnglishPlaceRecordPage({ params }: Readonly<{ params: Params }>) {
  const { dataVersion, geography, code } = await params;
  const record = placePageRecord(dataVersion, geography, decodeURIComponent(code));
  if (!record) notFound();
  return <SiteShell locale="en"><RecordPlacePage locale="en" record={record} /></SiteShell>;
}
