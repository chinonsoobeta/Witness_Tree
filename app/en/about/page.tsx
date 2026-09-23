import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site";
import { PRODUCT_NAME } from "@/lib/domain";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "About",
  alternates: localizedAlternates("en", { en: "/en/about", fr: "/fr/a-propos" }),
};

export default function EnglishAboutPage() {
  return <SiteShell locale="en"><main id="main" className="page-wrap">
    <header className="masthead"><h1>About {PRODUCT_NAME.en}</h1></header>
    <section className="content-section prose-measure">
      <h2>Coming soon</h2>
      <p>The owner hasn’t written this page yet. It will explain what {PRODUCT_NAME.en} is for and who runs it.</p>
      <p>For what the site covers and its limits, see <Link href="/en/methods">Methods</Link> and <Link href="/en/data">Data and transparency</Link>.</p>
    </section>
  </main></SiteShell>;
}
