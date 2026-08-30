import assert from "node:assert/strict";
import test from "node:test";

import {
  siteMetadata,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/site-metadata.ts";

test("the shared metadata uses the canonical public Witness Tree URL", () => {
  assert.ok(siteMetadata.metadataBase instanceof URL);
  assert.equal(siteMetadata.metadataBase.href, "https://www.witnesstree.ca/");
});
