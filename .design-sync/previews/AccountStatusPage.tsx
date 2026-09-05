import { AccountStatusPage } from "witness-tree";

// The account service is deliberately not active; this page states that and
// lists the planned v1 capabilities and the safeguards required before the
// service can operate. Locale is the only prop, and the two capability grids
// are what the French cell has to keep aligned once the strings grow.

export const English = () => <AccountStatusPage locale="en" />;

export const French = () => <AccountStatusPage locale="fr" />;
