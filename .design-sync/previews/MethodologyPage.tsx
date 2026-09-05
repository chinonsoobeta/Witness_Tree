import { MethodologyPage } from "witness-tree";

// Eight numbered governance sections, all copy, no props beyond locale. This
// is the page where the numbered-index rail and the prose measure have to hold
// together, so both cells are the whole page rather than a fragment.

export const English = () => <MethodologyPage locale="en" />;

export const French = () => <MethodologyPage locale="fr" />;
