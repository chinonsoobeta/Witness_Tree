import { ReportedValue } from "@/components/policy/ReportedValue";
import type { Locale } from "@/lib/domain";
import { buildWildfireViewModel, type WildfireFeedState, wildfireText } from "@/lib/wildfire";
import { ReaderLocalTime } from "./ReaderLocalTime";

export type WildfireViewProps = Readonly<{ locale: Locale; feed: WildfireFeedState; now?: Date }>;

export function WildfireView({ locale, feed, now }: WildfireViewProps) {
  const model = buildWildfireViewModel(feed, now);
  const text = wildfireText(locale);
  const emergencyLink = <a href={model.agencyUrl}>{text.emergency}</a>;
  return <main id="main" className="page-wrap" data-wildfire-state={model.state}>
    <header className="masthead">
      <p className="eyebrow">{text.fixture}</p>
      <h1>{text.title}</h1>
      <p className="dek">{text.context}</p>
      <p><strong>{emergencyLink}</strong></p>
    </header>
    <section className="content-section" aria-label={text.title}>
      <dl>
        <div><dt>{text.sourceUpdated}</dt><dd><time dateTime={model.sourceUpdatedAt}>{model.sourceUpdatedAt}</time></dd></div>
        <div><dt>{text.lastRefresh}</dt><dd><time dateTime={model.lastSuccessfulRefreshAt}>{model.lastSuccessfulRefreshAt}</time></dd></div>
        <div><dt>{text.agency}</dt><dd>{model.agencyName}</dd></div>
        <div><dt>{text.nextRefresh}</dt><dd><ReaderLocalTime dateTime={model.nextScheduledRefresh} locale={locale} /></dd></div>
        <div><dt>{text.emergency}</dt><dd>{emergencyLink}</dd></div>
      </dl>
      {model.state === "degraded" ? <aside role="alert"><p>{text.degraded}</p>{emergencyLink}</aside> : null}
      {model.state === "stale" ? <aside role="alert"><p>{text.stale}</p>{emergencyLink}</aside> : null}
      {model.state === "stale" ? null : <section>
        <h2>{text.summary}</h2>
        <ReportedValue reported={model.summary} coverageGrade="national-baseline" locale={locale} />
        <p>{text.perimeter}</p>
      </section>}
    </section>
  </main>;
}
