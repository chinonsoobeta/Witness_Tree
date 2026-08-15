import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REQUIRED_TERMS = [
  "stable artifact or snapshot", "checksum", "licence", "Canadian immutable raw archive",
  "transformation and derived/public reuse", "refresh and correction route", "right-of-reply"
];

export function validatePhase1PermissionOutreachPackage(pkg, matrix) {
  if (pkg?.schemaVersion !== 1 || pkg.status !== "sent-awaiting-response" || pkg.sender !== "Chinonso Obeta <chinonso8@gmail.com>") throw new Error("Outreach package identity and verified-sent status must be explicit.");
  if (!/Gmail Sent-label searches verified.*not an acquisition.*production eligibility/i.test(pkg.scope ?? "")) throw new Error("Outreach package must state bounded sent evidence and retain non-production boundaries.");
  if (!Array.isArray(pkg.messages) || pkg.messages.length !== 8) throw new Error("Outreach package must have seven verified sends and one existing-request record.");
  const ids = new Set();
  const rows = new Set();
  let sent = 0;
  let existing = 0;
  for (const message of pkg.messages) {
    if (typeof message.id !== "string" || ids.has(message.id) || typeof message.recipient !== "string" || !message.recipient.includes("@") || typeof message.subject !== "string" || !message.subject.trim() || !Array.isArray(message.canonicalRowIds) || !message.canonicalRowIds.length) throw new Error("Every outreach message needs unique identity, recipient, subject, and canonical rows.");
    ids.add(message.id);
    for (const row of message.canonicalRowIds) rows.add(row);
    if (message.status === "sent-awaiting-response") {
      sent += 1;
      if (typeof message.verifiedSentAt !== "string" || Number.isNaN(Date.parse(message.verifiedSentAt)) || !/^2026-08-14T\d{2}:\d{2}:\d{2}-05:00$/.test(message.verifiedSentAt) || !/Gmail Sent-label read-only search matched this exact sender, recipient, and subject; message and thread identifiers are intentionally omitted\./.test(message.sentVerification ?? "")) throw new Error(`${message.id} needs bounded, non-sensitive verified send evidence.`);
      if (/\b(?:message|thread)[ _-]?id\b/i.test(JSON.stringify(message))) throw new Error("Outreach evidence must not retain Gmail message or thread identifiers.");
    }
    else if (message.status === "already-sent-awaiting-response-no-new-message") existing += 1;
    else throw new Error("Outreach messages must be verified sends or the one no-duplicate existing request.");
    if (!Array.isArray(message.requestTerms) || REQUIRED_TERMS.some((term) => !message.requestTerms.some((requestTerm) => requestTerm.includes(term)))) throw new Error(`${message.id} must request the bounded artifact, rights, archive, reuse, refresh, and response terms.`);
  }
  if (sent !== 7 || existing !== 1) throw new Error("Outreach package must retain seven verified sends and one no-duplicate existing request.");
  const canonical = matrix?.rankedRows?.map((row) => row.id) ?? [];
  if (canonical.length !== 13 || rows.size !== canonical.length || canonical.some((row) => !rows.has(row))) throw new Error("Outreach package must cover every canonical access-blocked row.");
  return pkg;
}

export async function checkPhase1PermissionOutreachPackage() {
  const base = new URL("../", import.meta.url);
  const [pkg, matrix] = await Promise.all([
    readFile(new URL("data/phase1-permission-outreach-package.json", base), "utf8").then(JSON.parse),
    readFile(new URL("data/phase1-access-blocker-resolution.json", base), "utf8").then(JSON.parse)
  ]);
  return validatePhase1PermissionOutreachPackage(pkg, matrix);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkg = await checkPhase1PermissionOutreachPackage();
  console.log(`Phase 1 outreach package passed: ${pkg.messages.filter((message) => message.status === "sent-awaiting-response").length} verified sends, one no-duplicate existing request.`);
}
