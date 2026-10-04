import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { PRODUCT_NAME } from "@/lib/domain";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "About",
  alternates: localizedAlternates("en", { en: "/en/about", fr: "/fr/a-propos" }),
};

// The owner's own words, set exactly as written on 2026-10-03.
export default function EnglishAboutPage() {
  return <SiteShell locale="en"><main id="main" className="page-wrap">
    <header className="masthead"><h1>About {PRODUCT_NAME.en}</h1></header>
    <section className="content-section prose-measure">
      <p>Welcome to my website. My name is Chinonso Obeta and I’m a Policy Analyst based in Vancouver, BC who is employed in the provincial environmental assessment office. This work and my views are not endorsed by the Government of British Columbia.</p>
      <p>Like many other British Columbians, I’ve watched with alarm as our forest sector continues to descend into decline with many mills closing and people losing their jobs. Over the last century, the sector has anchored communities and towns all over the province and it is a source of employment and pride for many.</p>
      <p>After I heard of yet another mill closure this summer, I decided that I’d try to investigate the reasons for why this sector is declining. I started with two questions: How many trees are left, and where are they? This website is an attempt to answer that.</p>
      <ul className="about-links">
        <li><a href="https://www.linkedin.com/in/chinonso-obeta">My LinkedIn</a></li>
        <li><a href="https://www.chinonsoobeta.dev">My personal website</a></li>
      </ul>
    </section>
  </main></SiteShell>;
}
