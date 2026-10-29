# Corrections workflow

This is a policy and illustrative-fixture implementation only. It does not submit cases, send email, or persist subscriber data. The only public contact route it can show is the optional email link described in [Email route](#email-route), and only after the owner has named a recipient.

Critical cases acknowledge/resolve in 1/5 business days; Indigenous-geography cases 1/10; material 3/15; and minor 5/30. Production cases require a nonblank named accountable recipient and public record. Attribution disputes use the Indigenous-geography class. Public records state what was wrong, what is now, and why in English and French on one real ISO calendar publication date; the prior figure address remains a query-free, fragment-free internal path. Notices are generated only as subscriber identifiers, never email addresses.

## Email route

`lib/corrections/contact.ts` is the single configuration point for the accountable corrections recipient. The `/en/corrections` and `/fr/corrections` pages read the `CORRECTIONS_RECIPIENT_EMAIL` environment variable when they are built. The role shown with the address is the typed constant `CORRECTIONS_RECIPIENT_ROLE` (Corrections lead / Responsable des corrections). An unset, blank, or implausible value (anything other than a plain `local@domain.tld` address with no spaces, quotes, `?`, `&`, `#` or `%`) is treated as unset.

- **Unset:** the pages keep the interim wording unchanged: there is no way to send a correction yet, readers should note the details and check back, and their notes open no case and start no clock.
- **Set:** the interim instructions end with "then send them as described below", and a "Send a correction" / "Envoyer une correction" section names the role and address and gives a `mailto:` link. The link's subject (Correction request / Demande de correction) and body (one heading per line for the page link, exact words or number, date and time, language, why it looks wrong, and official source) are prefilled in the reader's language and URL-encoded per RFC 6068. They contain no product name. The section asks readers to include only a reply address and the listed details, with no other personal information and nothing about other people.

### What the route does and does not claim

- It does not add a form, a server route, storage, or analytics. The site never receives or keeps a message; the reader's own email program sends it directly to the recipient's mailbox. The address appears in the built page's HTML.
- **A received email does not open a production correction case and does not start the service clock.** The page says so in both languages. Reasons: `validateCorrection` allows a production case only with a named accountable recipient *and* a public record; the status line already says no final data has been published, so no production correction can exist yet; and the operations-readiness and public-beta correction gates in [EXTERNAL_GATES.md](EXTERNAL_GATES.md) are open. An email about the preview is handled by hand, with no response-time promise.
- When production cases do begin, `dueDates` counts both the acknowledgement and resolution targets from `submittedAt`, not from acknowledgement. The case must then record `submittedAt` as the time the email arrived, and the page wording about the clock must be changed in code at the same time. Until then, do not describe the service levels as running.

### Owner action to turn the route on

1. In the Vercel project, open Settings → Environment Variables and set `CORRECTIONS_RECIPIENT_EMAIL` to the monitored address of the person accountable for corrections, for the Production environment (and Preview, if previews should show it).
2. Redeploy. The value is read at build time, so setting, changing, or removing it has no effect until the next build.
3. Name the accountable person in the public record: add a dated owner record that names the person who holds the Corrections lead role and the date they took it on, and replace "None named" below. The policy requires a named, nonblank recipient before any production case exists; the address alone does not satisfy it.
4. To turn the route off, remove the variable and redeploy; the pages return to the interim wording.

### Recipient record

None named.

## Quarterly correction metrics

`lib/corrections/metrics.ts` is a pure, aggregate-only Phase 9 calculation. It accepts validated production cases only. Any illustrative case, no completed case, or no resolved case returns an explicit non-publishable insufficient-evidence result. A publishable result contains only counts by correction class and current outcome, the resolved-case median duration in milliseconds, and the unresolved-critical count. It does not render a beta or launch conclusion and it never returns case identifiers, people, subscriber identifiers, addresses, notices, or other case-level data.
