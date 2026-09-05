import fs from "node:fs";
import { archiveKeys, safeSegment } from "./lib/archive-staging/validate";

const HASHES = "/private/tmp/claude-501/-Users-chinonsoobeta-agirprofinance/e078036b-5e5a-4869-8dbf-9132fb06bf73/scratchpad/hashes.json";
const MTIMES = "/private/tmp/claude-501/-Users-chinonsoobeta-agirprofinance/e078036b-5e5a-4869-8dbf-9132fb06bf73/scratchpad/mtimes.json";
const OUT = "/private/tmp/claude-501/-Users-chinonsoobeta-agirprofinance/e078036b-5e5a-4869-8dbf-9132fb06bf73/scratchpad/keys.json";

const sourceId = "nrcan-annual-land-cover-v2";
const sourceVersion = "version-2";

if (!safeSegment(sourceId)) throw new Error("sourceId fails safeSegment");
if (!safeSegment(sourceVersion)) throw new Error("sourceVersion fails safeSegment");

const hashes = JSON.parse(fs.readFileSync(HASHES, "utf8")) as Array<{
  year: number; originalFilename: string; byteLength: number; sha256: string; crc64nvme: string; crc64nvmeBase64: string;
}>;
const mtimes = JSON.parse(fs.readFileSync(MTIMES, "utf8")) as Record<string, string>;

const out = hashes.map((h) => {
  const retrievedAt = mtimes[String(h.year)];
  if (!retrievedAt) throw new Error(`no mtime for ${h.year}`);
  const keys = archiveKeys({
    sourceId,
    sourceVersion,
    retrievedAt,
    sha256: h.sha256,
    originalFilename: h.originalFilename,
  } as never);
  return { ...h, sourceId, sourceVersion, retrievedAt, payloadKey: keys.payloadKey, manifestKey: keys.manifestKey };
});

const keySet = new Set(out.flatMap((o) => [o.payloadKey, o.manifestKey]));
if (keySet.size !== 78) throw new Error(`expected 78 distinct keys, got ${keySet.size}`);

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`derived ${out.length} key pairs (${keySet.size} distinct keys)`);
console.log(out[0].payloadKey);
console.log(out[0].manifestKey);
