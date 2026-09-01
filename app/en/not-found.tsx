import Link from "next/link";
import { SiteShell } from "@/components/site";

export default function NotFound() {
  return (
    <SiteShell locale="en">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <p className="eyebrow">404</p>
          <h1>Page not found</h1>
          <p className="dek">This address is not part of the public forest-loss record.</p>
        </header>
        <nav className="content-section prose-measure" aria-label="Continue from this page">
          <ul className="link-list">
            <li className="card card--lift"><Link href="/en/explore">Explore forest loss</Link></li>
            <li className="card card--lift"><Link href="/en/search">Search the record</Link></li>
            <li className="card card--lift"><Link href="/en">Return home</Link></li>
          </ul>
        </nav>
      </main>
    </SiteShell>
  );
}
