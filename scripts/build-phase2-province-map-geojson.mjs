import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root =
  process.env.WITNESS_TREE_DATA_ROOT ??
  "/Volumes/Extended_SSD/Witness_Tree-data";
const boundary = join(
  root,
  "raw/statcan-boundaries/2026-08-12/lpr_000b21a_e.zip",
);
const aggregate = join(
  root,
  "derived/phase2-v21-zonal-province-2021-cbf-v5/province-2020-2022.json",
);
const compatibilitySource = join(
  root,
  "derived/phase8-province-map-geojson-v1/aec8513a57c2360bf5a4c6faecc750155ba16f16f588b28773414cebde1cbd11/phase2-province-loss-2020-2022.geojson",
);
const expected = {
  boundary: "d28bbb15d7b49e3d1828755a5f1b4ebcee699ad70efe8b0f1b902d29ebffd20b",
  aggregate: "ff1589029f30800021b52d9aa736b9aa9e122df70e3070d19a68f7aa45d9a16d",
};
const sha = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const minimumExteriorRingAreaSquareDegrees = 0.001;
const ringArea = (ring) =>
  Math.abs(
    ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2,
  );
const removeTinyIslands = (geometry) => {
  if (geometry.type === "Polygon") return geometry;
  assert.equal(geometry.type, "MultiPolygon");
  const ranked = geometry.coordinates
    .map((polygon) => ({ polygon, area: ringArea(polygon[0]) }))
    .sort((a, b) => b.area - a.area);
  const coordinates = ranked
    .filter(
      ({ area }, index) =>
        index === 0 || area >= minimumExteriorRingAreaSquareDegrees,
    )
    .map(({ polygon }) => polygon);
  return { ...geometry, coordinates };
};
assert.equal(sha(boundary), expected.boundary);
assert.equal(sha(aggregate), expected.aggregate);
assert.equal(
  sha(compatibilitySource),
  "aec8513a57c2360bf5a4c6faecc750155ba16f16f588b28773414cebde1cbd11",
);

const ids = new Set(["24", "35", "48", "59"]);
const rows = new Map(
  JSON.parse(readFileSync(aggregate, "utf8"))
    .filter((row) => ids.has(row.boundaryId))
    .map((row) => [row.boundaryId, row]),
);
assert.equal(rows.size, 4);
const work = mkdtempSync(join(tmpdir(), "witness-tree-map-geojson-"));
try {
  const source = JSON.parse(readFileSync(compatibilitySource, "utf8"));
  source.name = "phase2_province_loss_2020_2022";
  source.features = source.features
    .map((feature) => {
      const row = rows.get(feature.properties.province_id);
      assert.ok(row);
      return { ...feature, geometry: removeTinyIslands(feature.geometry) };
    })
    .sort((a, b) =>
      a.properties.province_id.localeCompare(b.properties.province_id),
    );
  const candidate = join(work, "phase2-province-loss-2020-2022.geojson");
  writeFileSync(candidate, `${JSON.stringify(source)}\n`);
  const outputSha256 = sha(candidate);
  const outputDir = join(
    root,
    "derived/phase8-province-map-geojson-v1",
    outputSha256,
  );
  if (existsSync(outputDir))
    throw new Error(`immutable release already exists: ${outputDir}`);
  mkdirSync(outputDir, { recursive: true });
  const output = join(outputDir, "phase2-province-loss-2020-2022.geojson");
  copyFileSync(candidate, output);
  assert.equal(sha(output), outputSha256);
  const manifest = {
    schemaVersion: "witness-tree/phase8-province-map-geojson/1",
    status: "verified-browser-compatibility-release-candidate",
    inputs: {
      ...expected,
      compatibilitySource:
        "aec8513a57c2360bf5a4c6faecc750155ba16f16f588b28773414cebde1cbd11",
    },
    transform: {
      provinceIds: ["24", "35", "48", "59"],
      sourceCrs: "EPSG:4326",
      outputCrs: "EPSG:4326",
      minimumExteriorRingAreaSquareDegrees,
    },
    output: {
      fileName: "phase2-province-loss-2020-2022.geojson",
      byteLength: statSync(output).size,
      sha256: outputSha256,
      featureCount: 4,
      contentType: "application/geo+json",
    },
    claims: {
      technicalPreviewEligible: true,
      phase2ProductionGateComplete: false,
      perCellGeometryMaterialized: false,
    },
  };
  writeFileSync(
    join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        output,
        manifest: join(outputDir, "manifest.json"),
        ...manifest.output,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
