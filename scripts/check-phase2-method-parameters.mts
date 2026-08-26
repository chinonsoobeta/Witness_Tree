import { readFile } from "node:fs/promises";

import { validateMethodManifest, type MethodParameterManifest } from "../lib/pipeline/method-manifest";

const manifest = JSON.parse(await readFile(new URL("../data/phase2-method-parameters.json", import.meta.url), "utf8")) as MethodParameterManifest;
const identity = validateMethodManifest(manifest);
console.log(`Phase 2 method parameters passed: version=${identity.methodVersion} sha256=${identity.parameterSha256} productionEligible=false.`);
