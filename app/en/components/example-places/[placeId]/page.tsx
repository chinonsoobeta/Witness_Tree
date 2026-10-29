import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlacePage } from "@/components/places";
import { SiteShell } from "@/components/site";
import { examplePlacePath, PLACES, placeById } from "@/lib/places";
import { localizedAlternates } from "@/lib/site-metadata";

// The illustrative place template lives with the component gallery: it is an
// example of how a record is laid out, never a place's data. Real places are
// under /en/places/<data version>/<geography>/<code>.
export async function generateMetadata({ params }: { params: Promise<{ placeId: string }> }): Promise<Metadata> {
  const { placeId } = await params;
  return {
    alternates: localizedAlternates("en", { en: examplePlacePath("en", placeId), fr: examplePlacePath("fr", placeId) }),
    robots: { index: false, follow: false },
  };
}

export function generateStaticParams() { return PLACES.map(({ id: placeId }) => ({ placeId })); }

export default async function EnglishExamplePlacePage({ params, searchParams }: Readonly<{ params: Promise<{ placeId: string }>; searchParams: Promise<{ view?: string }> }>) {
  const [{ placeId }, query] = await Promise.all([params, searchParams]);
  const place = placeById(placeId);
  if (!place) notFound();
  return <SiteShell locale="en"><PlacePage locale="en" place={place} view={query.view === "table" ? "table" : "chart"} /></SiteShell>;
}
