import { notFound } from "next/navigation";

/** Route unmatched French paths through the locale-owned 404 boundary. */
export default function FrenchNotFoundCatchAll() {
  notFound();
}
