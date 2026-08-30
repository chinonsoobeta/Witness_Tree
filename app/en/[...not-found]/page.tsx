import { notFound } from "next/navigation";

/** Route unmatched English paths through the locale-owned 404 boundary. */
export default function EnglishNotFoundCatchAll() {
  notFound();
}
