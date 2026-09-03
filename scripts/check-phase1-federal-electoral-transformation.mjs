// Runs the approved federal-electoral runner's preflight against the canonical data root.
//
// The runner predates scripts/data-root.mjs and computes its own default root from the
// repository layout, as realpath(REPO_ROOT/../../Witness_Tree-data). That is correct only on a
// machine where the checkout happens to sit beside the archive. From a worktree it names a
// directory that exists nowhere, so the preflight stopped on "missing local input" while the
// archive was attached the whole time, and the failure looked from the outside like an absent
// drive rather than a check pointed at the wrong place.
//
// The fix does not belong in the runner. Its bytes are bound into an owner execution approval
// carrying ingestion, release, production admission, production eligibility and deployment, and
// the last one-line repair to it (2026-08-26) required a two-step owner decision to rebind that
// approval and re-admit production. Editing it to correct a default would demand the same, for a
// change that alters no output. The runner already accepts --data-root, so this passes the
// canonical root and leaves every owner binding byte-identical.
//
// This adds no leniency. Before, the preflight verified nothing and said so; now it reads the
// real archive and verifies the produced output against its sidecar.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveDataRoot } from "./data-root.mjs";

const runner = fileURLToPath(new URL("run-phase1-federal-electoral-transformation.mjs", import.meta.url));
const result = spawnSync(process.execPath, [runner, "--preflight", "--data-root", resolveDataRoot()], { stdio: "inherit" });
process.exit(result.status ?? 1);
