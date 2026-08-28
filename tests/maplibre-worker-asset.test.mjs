import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkMaplibreWorkerAsset } from "../scripts/check-maplibre-worker-asset.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const VERSION = "9.9.9";
const WORKER = "maplibre-gl-worker.mjs";
const SHARED = "maplibre-gl-shared.mjs";

const CLIENT_BODY = [
  'const MAPLIBRE_WORKER_VERSION = "9.9.9";',
  "const MAPLIBRE_WORKER_URL = `/maplibre/${MAPLIBRE_WORKER_VERSION}/maplibre-gl-worker.mjs`;",
  "maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);",
].join("\n");

const buildFixture = async (overrides = {}) => {
  const root = await mkdtemp(path.join(tmpdir(), "maplibre-worker-"));
  const version = overrides.installedVersion ?? VERSION;

  const distDir = path.join(root, "node_modules", "maplibre-gl", "dist");
  await mkdir(distDir, { recursive: true });
  await writeFile(
    path.join(root, "node_modules", "maplibre-gl", "package.json"),
    JSON.stringify({ name: "maplibre-gl", version }),
  );
  await writeFile(path.join(distDir, WORKER), overrides.distWorker ?? "worker-bytes");
  await writeFile(path.join(distDir, SHARED), overrides.distShared ?? "shared-bytes");

  if (!overrides.omitPublished) {
    const publishedDir = path.join(
      root,
      "public",
      "maplibre",
      overrides.publishedVersion ?? version,
    );
    await mkdir(publishedDir, { recursive: true });
    if (!overrides.omitPublishedWorker) {
      await writeFile(
        path.join(publishedDir, WORKER),
        overrides.publishedWorker ?? overrides.distWorker ?? "worker-bytes",
      );
    }
    if (!overrides.omitPublishedShared) {
      await writeFile(
        path.join(publishedDir, SHARED),
        overrides.publishedShared ?? overrides.distShared ?? "shared-bytes",
      );
    }
  }

  const clientDir = path.join(root, "components", "explore");
  await mkdir(clientDir, { recursive: true });
  if (!overrides.omitClient) {
    await writeFile(
      path.join(clientDir, "ExploreMapClient.tsx"),
      overrides.client ?? CLIENT_BODY,
    );
  }

  return root;
};

const withFixture = async (overrides, assertions) => {
  const root = await buildFixture(overrides);
  try {
    await assertions(await checkMaplibreWorkerAsset(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const assertFails = (result, fragment) => {
  assert.equal(result.ok, false, "expected the check to fail");
  assert.ok(
    result.failures.some((failure) => failure.includes(fragment)),
    `expected a failure mentioning "${fragment}", got: ${JSON.stringify(result.failures)}`,
  );
};

test("accepts published assets that are byte-identical and correctly pinned", async () => {
  await withFixture({}, (result) => {
    assert.equal(result.ok, true, JSON.stringify(result.failures));
    assert.equal(result.observed.version, VERSION);
    assert.equal(result.observed.files.length, 2);
  });
});

test("fails closed when the published worker is absent", async () => {
  await withFixture({ omitPublishedWorker: true }, (result) => {
    assertFails(result, `Missing published worker asset public/maplibre/${VERSION}/${WORKER}`);
  });
});

test("fails closed when the published shared sibling is absent", async () => {
  await withFixture({ omitPublishedShared: true }, (result) => {
    assertFails(result, `Missing published worker asset public/maplibre/${VERSION}/${SHARED}`);
  });
});

test("rejects a published worker that drifted from the installed package", async () => {
  await withFixture({ publishedWorker: "tampered-bytes" }, (result) => {
    assertFails(result, "is not byte-identical to the installed package");
  });
});

test("rejects a published shared module that drifted from the installed package", async () => {
  await withFixture({ publishedShared: "tampered-bytes" }, (result) => {
    assertFails(result, `${SHARED} is not byte-identical`);
  });
});

test("rejects assets published under a version other than the installed one", async () => {
  await withFixture({ publishedVersion: "1.0.0" }, (result) => {
    assertFails(result, `Missing published worker asset public/maplibre/${VERSION}`);
  });
});

test("rejects a client that pins a different worker version", async () => {
  await withFixture(
    { client: CLIENT_BODY.replace('"9.9.9"', '"1.2.3"') },
    (result) => {
      assertFails(result, 'pins MAPLIBRE_WORKER_VERSION "1.2.3"');
    },
  );
});

test("rejects a client that declares no worker version", async () => {
  await withFixture({ client: "const nothing = true;" }, (result) => {
    assertFails(result, "does not declare MAPLIBRE_WORKER_VERSION");
  });
});

test("rejects a client that never calls setWorkerUrl", async () => {
  await withFixture(
    {
      client: CLIENT_BODY.replace(
        "maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);",
        "",
      ),
    },
    (result) => {
      assertFails(result, "does not call setWorkerUrl(MAPLIBRE_WORKER_URL)");
    },
  );
});

test("rejects a client whose worker URL is not built from the pinned version", async () => {
  await withFixture(
    {
      client: CLIENT_BODY.replace(
        "const MAPLIBRE_WORKER_URL = `/maplibre/${MAPLIBRE_WORKER_VERSION}/maplibre-gl-worker.mjs`;",
        'const MAPLIBRE_WORKER_URL = "/maplibre/9.9.9/maplibre-gl-worker.mjs";',
      ),
    },
    (result) => {
      assertFails(result, "does not build the worker URL from MAPLIBRE_WORKER_VERSION");
    },
  );
});

test("fails closed when maplibre-gl is not installed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "maplibre-worker-none-"));
  try {
    const result = await checkMaplibreWorkerAsset(root);
    assertFails(result, "maplibre-gl is not installed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the real repository publishes verified worker assets", async () => {
  const result = await checkMaplibreWorkerAsset(repoRoot);
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.ok(result.observed.files.length === 2);
  for (const file of result.observed.files) {
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
    assert.ok(file.byteLength > 0);
  }
});
