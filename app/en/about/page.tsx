import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { PRODUCT_NAME } from "@/lib/domain";

export const metadata: Metadata = {
  title: "About",
  alternates: { languages: { en: "/en/about", fr: "/fr/a-propos" } },
};

export default function EnglishAboutPage() {
  return <SiteShell locale="en"><main id="main" className="page-wrap">
    <header className="masthead"><h1>About {PRODUCT_NAME.en}</h1></header>
    <section className="content-section prose-measure">
      <h2>Owner copy pending</h2>
      <p>This space is reserved for the owner’s description of {PRODUCT_NAME.en}, its purpose and its stewardship. No owner statement has been supplied for publication.</p>
      <p>For the currently published scope and evidence limits, see <a href="/en/methods">Methods</a> and <a href="/en/data">Data and transparency</a>.</p>
    </section>
  </main></SiteShell>;
}
