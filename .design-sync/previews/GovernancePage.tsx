import { GovernancePage } from "witness-tree";

// One component renders all seven governance documents; `kind` is its real
// variant axis. Glossary is the canonical body (headings plus a single
// paragraph each), Releases is the only kind that also renders a link list of
// download cards, and the French cell takes the decision log, whose paragraphs
// are the longest in the set.

export const Glossary = () => <GovernancePage kind="glossary" locale="en" />;

export const Releases = () => <GovernancePage kind="releases" locale="en" />;

export const DecisionsFrench = () => <GovernancePage kind="decisions" locale="fr" />;
