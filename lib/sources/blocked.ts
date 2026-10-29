import becBlock from "@/data/bc-bec-snapshot-block.json";
import fomAccess from "@/data/bc-forest-operations-map-access.json";
import rights from "@/data/bc-harvest-source-rights-2026-09-26.json";
import tapBlock from "@/data/bc-tap-priority-deferral-block.json";
import vriBlock from "@/data/bc-vri-access-block.json";
import ontarioFriBlock from "@/data/ontario-fri-term2-access-block.json";
import resolution from "@/data/phase1-access-blocker-resolution.json";
import replyAudit from "@/data/phase1-outreach-reply-audit.json";
import outreach from "@/data/phase1-permission-outreach-package.json";
import ledger from "@/data/phase1-production-source-ledger.json";
import scopeDecision from "@/data/phase-scope-decision-2026-09-26.json";
import sopfeuBlock from "@/data/sopfeu-wildfire-access-block.json";
import type { Locale } from "@/lib/domain";

/*
 * Sources the record could not use, read through their own records.
 *
 * Every line the page shows names the record field it rests on. A field that
 * is missing, or no longer says what the line says, stops the build, so the
 * page cannot show a source, a date or a status the records do not hold.
 *
 * The records also hold the names and addresses of people who wrote or
 * answered requests. None is shown: a source is described by its agency, what
 * it would add, its licence or access condition, and the date and status of
 * its last request, and nothing else.
 */

/** Every record this module reads, exported so tests can check what the page leaves out. */
export const BLOCKED_SOURCE_RECORDS = {
  ledger,
  scopeDecision,
  rights,
  outreach,
  replyAudit,
  resolution,
  sopfeuBlock,
  vriBlock,
  becBlock,
  tapBlock,
  fomAccess,
  ontarioFriBlock,
} as const;
type RecordName = keyof typeof BLOCKED_SOURCE_RECORDS;

/** A field in a record: `a.b.0`, or `list[id=value].field` to pick an entry by its key. */
export type Basis = Readonly<{ record: RecordName; path: string; includes?: string; equals?: string }>;
type Localized = Readonly<{ en: string; fr: string }>;
type Field = Localized & Readonly<{ basis: readonly Basis[] }>;
type DatedStep = Readonly<{ label: Localized; date: Basis; basis?: readonly Basis[] }>;

type BlockedSourceSpec = Readonly<{
  id: string;
  ledgerIds: readonly string[];
  agency: Field;
  title: Field;
  adds: Field;
  condition: Field;
  lastRequest: DatedStep;
  status: DatedStep;
}>;

const SPECS: readonly BlockedSourceSpec[] = [
  {
    id: "sopfeu",
    ledgerIds: ["sopfeu"],
    agency: { en: "SOPFEU", fr: "SOPFEU", basis: [{ record: "sopfeuBlock", path: "publisher", equals: "SOPFEU" }] },
    title: {
      en: "Current wildfire information for Québec",
      fr: "Information actuelle sur les feux de forêt au Québec",
      basis: [{ record: "sopfeuBlock", path: "current.publicSituationUrl" }],
    },
    adds: {
      en: "Québec’s current wildfire situation from the agency that fights the fires, as context beside the historical fire record.",
      fr: "La situation actuelle des feux de forêt au Québec, selon l’organisme qui les combat, en contexte à côté de l’historique des feux.",
      basis: [{ record: "sopfeuBlock", path: "current.reason", includes: "current situation information" }],
    },
    condition: {
      en: "The site’s terms forbid reproduction, distribution or modification without prior written permission, and no open data catalogue or public data service was found.",
      fr: "Les conditions du site interdisent toute reproduction, distribution ou modification sans autorisation écrite préalable, et aucun catalogue de données ouvertes ni service public de données n’a été trouvé.",
      basis: [
        { record: "sopfeuBlock", path: "terms.exactRestrictionFr", includes: "sans autorisation écrite préalable" },
        { record: "sopfeuBlock", path: "current.reason", includes: "no official open-data catalogue" },
      ],
    },
    lastRequest: {
      label: { en: "Permission requested on", fr: "Autorisation demandée le" },
      date: { record: "outreach", path: "messages[id=sopfeu-wildfire-data-permission].verifiedSentAt" },
    },
    status: {
      label: { en: "No reply as of", fr: "Aucune réponse en date du" },
      date: { record: "rights", path: "recordedOn" },
      basis: [
        { record: "rights", path: "noReplyYet", includes: "sopfeu" },
        { record: "replyAudit", path: "rows[id=sopfeu].replyStatus", equals: "no-substantive-reply" },
      ],
    },
  },
  {
    id: "bc-vri",
    ledgerIds: ["bc-vri"],
    agency: {
      en: "Province of British Columbia, Ministry of Forests",
      fr: "Province de la Colombie-Britannique, ministère des Forêts",
      basis: [{ record: "vriBlock", path: "source.publisher", equals: "Province of British Columbia, Ministry of Forests" }],
    },
    title: {
      en: "VRI - 2025 - Forest Vegetation Composite Polygons",
      fr: "VRI - 2025 - Forest Vegetation Composite Polygons (inventaire de la végétation)",
      basis: [{ record: "rights", path: "sources[sourceId=bc-vri].dataset", equals: "VRI - 2025 - Forest Vegetation Composite Polygons" }],
    },
    adds: {
      en: "What the forest was like before a loss: British Columbia’s forest inventory.",
      fr: "L’état de la forêt avant une perte\u202F: l’inventaire forestier de la Colombie-Britannique.",
      basis: [{ record: "vriBlock", path: "scope.allowedOnlyAfterAdmission", includes: "Pre-event forest-condition inventory" }],
    },
    condition: {
      en: "Access Only: it may not be reproduced or redistributed without written permission.",
      fr: "Accès seulement (Access Only)\u202F: elle ne peut être reproduite ni redistribuée sans autorisation écrite.",
      basis: [
        { record: "vriBlock", path: "rights.catalogueLicence", equals: "Access Only" },
        { record: "vriBlock", path: "rights.officialRestriction", includes: "without written permission" },
      ],
    },
    lastRequest: {
      label: { en: "Acceptance of the custodian’s conditions sent on", fr: "Acceptation des conditions du gardien des données envoyée le" },
      date: { record: "rights", path: "recordedOn" },
      basis: [{ record: "rights", path: "sources[sourceId=bc-vri].nextStep", includes: "on 2026-09-26 accepting both conditions for VRI 2025" }],
    },
    status: {
      label: { en: "Permission not yet confirmed. Offered on conditions on", fr: "Autorisation pas encore confirmée. Offerte sous conditions le" },
      date: { record: "rights", path: "sources[sourceId=bc-vri].receivedOn" },
      basis: [{ record: "rights", path: "sources[sourceId=bc-vri].rightsStatus", equals: "offered-owner-acceptance-sent-awaiting-grant" }],
    },
  },
  {
    id: "bc-old-growth-bec",
    ledgerIds: ["bc-old-growth-bec"],
    agency: {
      en: "BC Ministry of Forests",
      fr: "Ministère des Forêts de la Colombie-Britannique",
      basis: [{ record: "resolution", path: "rankedRows[id=bc-old-growth-bec].resolution", includes: "BC Ministry of Forests" }],
    },
    title: {
      en: "BEC Map v13.1, and Old Growth Technical Advisory Panel (TAP) - Priority Deferral Areas - Current View",
      fr: "Carte BEC v13.1 et Old Growth Technical Advisory Panel (TAP) - Priority Deferral Areas - Current View",
      basis: [
        { record: "resolution", path: "rankedRows[id=bc-old-growth-bec].verifiedFinding", includes: "BEC Map v13.1" },
        { record: "tapBlock", path: "source.datasetTitle", equals: "Old Growth Technical Advisory Panel (TAP) - Priority Deferral Areas - Current View" },
      ],
    },
    adds: {
      en: "Ecosystem zones and old-growth deferral areas in British Columbia, as context only.",
      fr: "Les zones écologiques et les aires de report des vieilles forêts en Colombie-Britannique, à titre de contexte seulement.",
      basis: [
        { record: "becBlock", path: "scope.roleAfterAdmission", equals: "BC ecosystem context." },
        { record: "tapBlock", path: "scope.roleIfAuthorized", includes: "Old-growth and priority-deferral context" },
      ],
    },
    condition: {
      en: "The BEC map is under the Open Government Licence - British Columbia, but a complete copy comes only through a custom-download order that needs an account and acceptance of terms. The TAP layer is Access Only.",
      fr: "La carte BEC relève de l’Open Government Licence - British Columbia, mais une copie complète ne s’obtient que par une commande de téléchargement personnalisé qui exige un compte et l’acceptation de conditions. La couche TAP est en accès seulement (Access Only).",
      basis: [
        { record: "becBlock", path: "source.licence", equals: "Open Government Licence - British Columbia" },
        { record: "ledger", path: "entries[id=bc-old-growth-bec].blocker", includes: "custom-download route is an indirect order" },
        { record: "tapBlock", path: "source.licence", equals: "Access Only" },
      ],
    },
    lastRequest: {
      label: { en: "Acceptance of the conditions for the TAP layer sent on", fr: "Acceptation des conditions pour la couche TAP envoyée le" },
      date: { record: "rights", path: "recordedOn" },
      basis: [{ record: "rights", path: "sources[sourceId=bc-vri].nextStep", includes: "the TAP deferral layer" }],
    },
    status: {
      label: { en: "TAP permission not yet confirmed, and no complete copy of the BEC map. Last reply about the BEC map on", fr: "Autorisation TAP pas encore confirmée, et aucune copie complète de la carte BEC. Dernière réponse sur la carte BEC le" },
      date: { record: "replyAudit", path: "substantiveReplies[id=reply-bc-bec-custom-download-route].receivedAt" },
      basis: [
        { record: "replyAudit", path: "substantiveReplies[id=reply-bc-bec-custom-download-route].status", equals: "custom-download-route-no-acquisition" },
        { record: "replyAudit", path: "rows[id=bc-old-growth-bec].replyStatus", includes: "no-resolution" },
      ],
    },
  },
  {
    id: "bc-forest-operations-map",
    ledgerIds: ["bc-forest-operations-map"],
    agency: {
      en: "Forest Science, Planning and Practices Branch, Government of British Columbia",
      fr: "Forest Science, Planning and Practices Branch, gouvernement de la Colombie-Britannique",
      basis: [
        { record: "fomAccess", path: "catalogue.publisher", equals: "Forest Science, Planning and Practices Branch" },
        { record: "rights", path: "sources[sourceId=bc-forest-operations-map].provenance.senderDomain", equals: "gov.bc.ca" },
      ],
    },
    title: {
      en: "Forest Operations Map (FOM) - Cutblocks",
      fr: "Forest Operations Map (FOM) - Cutblocks (carte des opérations forestières)",
      basis: [{ record: "fomAccess", path: "catalogue.title", equals: "Forest Operations Map (FOM) - Cutblocks" }],
    },
    adds: {
      en: "Cutblocks planned but not yet permitted, as context only. It is not a record of completed harvest.",
      fr: "Les blocs de coupe prévus mais pas encore autorisés, à titre de contexte seulement. Ce n’est pas un registre des récoltes réalisées.",
      basis: [
        { record: "fomAccess", path: "scopeAndLifecycleCaveats.0", includes: "not yet permitted" },
        { record: "fomAccess", path: "scopeAndLifecycleCaveats.3", includes: "must not be used to infer completed harvest" },
      ],
    },
    condition: {
      en: "Access Only. The custodian says the layers are view-only and not downloadable, so permission cannot be granted.",
      fr: "Accès seulement (Access Only). Le gardien des données indique que les couches sont en consultation seulement et non téléchargeables\u202F; l’autorisation ne peut donc pas être accordée.",
      basis: [
        { record: "fomAccess", path: "catalogue.licenceTitle", equals: "Access Only" },
        { record: "rights", path: "sources[sourceId=bc-forest-operations-map].operativeText", includes: "view-only and not downloadable" },
      ],
    },
    lastRequest: {
      label: { en: "Permission requested on", fr: "Autorisation demandée le" },
      date: { record: "fomAccess", path: "permissionRequest.submittedAt" },
    },
    status: {
      label: { en: "Refused on", fr: "Refusée le" },
      date: { record: "rights", path: "sources[sourceId=bc-forest-operations-map].receivedOn" },
      basis: [{ record: "rights", path: "sources[sourceId=bc-forest-operations-map].rightsStatus", equals: "refused" }],
    },
  },
  {
    id: "on-fri-term-2",
    ledgerIds: ["on-fri", "on-fri-term-2"],
    agency: {
      en: "Ontario Ministry of Natural Resources and Forestry",
      fr: "Ministère des Richesses naturelles et des Forêts de l’Ontario",
      basis: [{ record: "ontarioFriBlock", path: "publisher", equals: "Ontario Ministry of Natural Resources and Forestry" }],
    },
    // The catalogue title, with the site's dash between its years.
    title: {
      en: "Forest Resource Inventory Term 2 (T2), 2018–2028",
      fr: "Forest Resource Inventory Term 2 (T2), 2018–2028 (inventaire des ressources forestières)",
      basis: [
        { record: "ontarioFriBlock", path: "catalogue.title", includes: "Forest Resource Inventory Term 2 (T2)" },
        { record: "ontarioFriBlock", path: "catalogue.title", includes: "2018" },
        { record: "ontarioFriBlock", path: "catalogue.title", includes: "2028" },
      ],
    },
    adds: {
      en: "What the forest was like before a loss: Ontario’s forest inventory, by forest management unit.",
      fr: "L’état de la forêt avant une perte\u202F: l’inventaire forestier de l’Ontario, par unité de gestion forestière.",
      basis: [{ record: "ontarioFriBlock", path: "access.reason", includes: "FMU data sets" }],
    },
    condition: {
      en: "The catalogue names the Open Government Licence – Ontario, but offers only web viewers, not a download, and written confirmation is needed for the exact package before reuse.",
      fr: "Le catalogue indique l’Open Government Licence – Ontario, mais n’offre que des visionneuses Web, sans téléchargement, et une confirmation écrite est requise pour le paquet exact avant toute réutilisation.",
      basis: [
        { record: "ontarioFriBlock", path: "catalogue.licence", equals: "Open Government Licence – Ontario" },
        { record: "ontarioFriBlock", path: "access.reason", includes: "not a downloadable Term 2 payload" },
        { record: "ontarioFriBlock", path: "rights.reason", includes: "Written confirmation is required for the exact released Term 2 package" },
      ],
    },
    lastRequest: {
      label: { en: "Package and reuse terms requested on", fr: "Paquet et conditions de réutilisation demandés le" },
      date: { record: "outreach", path: "messages[id=ontario-fri-term2-package-and-rights].verifiedSentAt" },
    },
    status: {
      label: {
        en: "The ministry replied that the products will be posted when available for public use; none was available as of",
        fr: "Le ministère a répondu que les produits seront publiés lorsqu’ils seront disponibles pour usage public\u202F; aucun ne l’était en date du",
      },
      date: { record: "rights", path: "recordedOn" },
      basis: [
        { record: "replyAudit", path: "substantiveReplies[id=reply-ontario-fri-catalogue-deferral].status", equals: "catalogue-deferral-no-package" },
        { record: "rights", path: "noReplyNote", includes: "none is available yet" },
      ],
    },
  },
];

/* Resolving and checking the record fields. */

/** Reads one record field, or throws if it is missing or no longer says what the page says. */
export function resolve(basis: Basis): unknown {
  let value: unknown = BLOCKED_SOURCE_RECORDS[basis.record];
  for (const part of basis.path.split(".")) {
    const keyed = /^(\w+)\[(\w+)=([^\]]+)\]$/.exec(part);
    if (keyed) {
      const list = (value as Record<string, unknown> | null)?.[keyed[1]!];
      value = Array.isArray(list) ? list.find((entry) => (entry as Record<string, unknown>)?.[keyed[2]!] === keyed[3]) : undefined;
    } else if (Array.isArray(value)) {
      value = value[Number(part)];
    } else {
      value = value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
    }
    if (value === undefined || value === null) break;
  }
  const where = `${basis.record}.${basis.path}`;
  if (value === undefined || value === null || value === "") throw new Error(`Blocked source: ${where} is missing from its record.`);
  if (basis.equals !== undefined && value !== basis.equals) throw new Error(`Blocked source: ${where} no longer reads "${basis.equals}".`);
  if (basis.includes !== undefined) {
    const holds = Array.isArray(value) ? value.includes(basis.includes) : String(value).includes(basis.includes);
    if (!holds) throw new Error(`Blocked source: ${where} no longer says "${basis.includes}".`);
  }
  return value;
}

function resolveDate(basis: Basis) {
  const value = resolve(basis);
  const date = typeof value === "string" ? /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1] : undefined;
  if (!date) throw new Error(`Blocked source: ${basis.record}.${basis.path} is not a date.`);
  return date;
}

/** Nothing the page shows may carry an address or a request reference. */
const FORBIDDEN = /@|\bFOI\b|freedom of information|accès à l’information|access to information/i;
function guard(text: string, where: string) {
  if (FORBIDDEN.test(text)) throw new Error(`Blocked source ${where}: shown text must not carry an address or a request reference.`);
  return text;
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** The ledger's access-blocked rows that are still blocked: not withdrawn by the owner, and not open or granted. */
function stillBlockedLedgerIds() {
  const withdrawn = new Set(asStrings(scopeDecision.withdrawnLedgerRows));
  const usable = new Set(rights.sources.filter((source) => source.rightsStatus === "granted" || source.rightsStatus === "open").map((source) => source.sourceId));
  const blocked = ledger.entries.filter((entry) => entry.evidenceState === "access-blocked").map((entry) => entry.id);
  return {
    blocked: blocked.filter((id) => !withdrawn.has(id) && !usable.has(id)),
    withdrawn: blocked.filter((id) => withdrawn.has(id)),
    usable: blocked.filter((id) => usable.has(id)),
  };
}

export type BlockedSource = Readonly<{
  id: string;
  ledgerIds: readonly string[];
  agency: Localized;
  title: Localized;
  adds: Localized;
  condition: Localized;
  lastRequest: Readonly<{ label: Localized; date: string }>;
  status: Readonly<{ label: Localized; date: string }>;
}>;

export type BlockedSourceRegister = Readonly<{
  /** The ledger's own date, beside the later rights record. */
  ledgerAsOf: string;
  rightsRecordedOn: string;
  sources: readonly BlockedSource[];
  /** Access-blocked ledger rows left off the list, and why. */
  notListed: Readonly<{ usable: readonly string[]; withdrawn: readonly string[]; withdrawnOn: string }>;
}>;

export function blockedSourceRegister(): BlockedSourceRegister {
  const { blocked, withdrawn, usable } = stillBlockedLedgerIds();
  const covered = SPECS.flatMap((spec) => spec.ledgerIds);
  const missing = blocked.filter((id) => !covered.includes(id));
  const extra = covered.filter((id) => !blocked.includes(id));
  if (missing.length || extra.length || new Set(covered).size !== covered.length) {
    throw new Error(`Blocked sources must match the ledger exactly (missing: ${missing.join(", ") || "none"}; not blocked: ${extra.join(", ") || "none"}).`);
  }
  const field = (spec: BlockedSourceSpec, name: string, value: Field): Localized => {
    value.basis.forEach(resolve);
    return { en: guard(value.en, `${spec.id}.${name}`), fr: guard(value.fr, `${spec.id}.${name}`) };
  };
  const step = (spec: BlockedSourceSpec, name: string, value: DatedStep) => {
    (value.basis ?? []).forEach(resolve);
    return {
      label: { en: guard(value.label.en, `${spec.id}.${name}`), fr: guard(value.label.fr, `${spec.id}.${name}`) },
      date: resolveDate(value.date),
    };
  };
  const sources = SPECS.map((spec) => ({
    id: spec.id,
    ledgerIds: spec.ledgerIds,
    agency: field(spec, "agency", spec.agency),
    title: field(spec, "title", spec.title),
    adds: field(spec, "adds", spec.adds),
    condition: field(spec, "condition", spec.condition),
    lastRequest: step(spec, "lastRequest", spec.lastRequest),
    status: step(spec, "status", spec.status),
  }));
  return {
    ledgerAsOf: resolveDate({ record: "ledger", path: "asOf" }),
    rightsRecordedOn: resolveDate({ record: "rights", path: "recordedOn" }),
    sources,
    notListed: { usable, withdrawn, withdrawnOn: resolveDate({ record: "scopeDecision", path: "decidedAt" }) },
  };
}

/** A record date (YYYY-MM-DD) as a reader writes it. */
export function formatRecordDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
