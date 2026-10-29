import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site";
import { PRODUCT_NAME } from "@/lib/domain";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("en", { en: "/en/about", fr: "/fr/a-propos" });

// The owner's own words of 2026-10-03. On 2026-10-28 the closing paragraph was
// reframed around what the record answers: it measures loss, not standing
// timber (plan section 1.3). The reframing awaits the owner's review.
export default function EnglishAboutPage() {
  return <SiteShell locale="en"><main id="main" className="page-wrap">
    <header className="masthead"><h1>About {PRODUCT_NAME.en}</h1></header>
    <section className="content-section prose-measure">
      <p>Welcome to my website. My name is Chinonso Obeta and I’m a Policy Analyst based in Vancouver, BC who is employed in the provincial environmental assessment office. This work and my views are not endorsed by the Government of British Columbia.</p>
      <p>Like many other British Columbians, I’ve watched with alarm as our forest sector continues to descend into decline with many mills closing and people losing their jobs. Over the last century, the sector has anchored communities and towns all over the province and it is a source of employment and pride for many.</p>
      <p>After I heard of yet another mill closure this summer, I decided that I’d try to investigate the reasons for why this sector is declining. This website brings together what the public record can show about the forest in British Columbia, Alberta, Ontario and Québec:</p>
      <ul>
        <li>How much forest satellites detected as lost, and where. <Link href="/en/explore">Explore the map</Link> or <Link href="/en/search">search for a place</Link>.</li>
        <li>Whether trees grew back after the loss. <Link href="/en/explore?mode=condition-recovery">See condition and recovery</Link>.</li>
        <li>What was logged and what burned, province by province. <Link href="/en/data/harvest-and-fire">See harvest and fire by province</Link>.</li>
        <li>How much timber was harvested each year, next to the amount each province allowed to be cut: <Link href="/en/data/bc-harvest-volume">British Columbia</Link>; <Link href="/en/data/provincial-harvest-volume">Alberta, Ontario and Québec</Link>.</li>
      </ul>
      <p>This website does not estimate how many trees are left or how much timber could still be cut, because satellite images show where forest was lost, not how much wood is standing. <Link href="/en/methods">Read how the record is built</Link>.</p>
      <ul className="about-links">
        <li><a href="https://www.linkedin.com/in/chinonso-obeta">My LinkedIn</a></li>
        <li><a href="https://www.chinonsoobeta.dev">My personal website</a></li>
      </ul>
    </section>
  </main></SiteShell>;
}
