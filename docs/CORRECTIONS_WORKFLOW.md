# Corrections workflow

This is a policy and illustrative-fixture implementation only. It does not submit cases, send email, persist subscriber data, or claim a public contact route.

Critical cases acknowledge/resolve in 1/5 business days; Indigenous-geography cases 1/10; material 3/15; and minor 5/30. Production cases require a nonblank named accountable recipient and public record. Attribution disputes use the Indigenous-geography class. Public records state what was wrong, what is now, and why in English and French on one real ISO calendar publication date; the prior figure address remains a query-free, fragment-free internal path. Notices are generated only as subscriber identifiers, never email addresses.

## Quarterly correction metrics

`lib/corrections/metrics.ts` is a pure, aggregate-only Phase 9 calculation. It accepts validated production cases only. Any illustrative case, no completed case, or no resolved case returns an explicit non-publishable insufficient-evidence result. A publishable result contains only counts by correction class and current outcome, the resolved-case median duration in milliseconds, and the unresolved-critical count. It does not render a beta or launch conclusion and it never returns case identifiers, people, subscriber identifiers, addresses, notices, or other case-level data.
