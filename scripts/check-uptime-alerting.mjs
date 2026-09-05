import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function validateUptimeAlerting(probe, alert) {
  const uncomment = (text) => text.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  probe = uncomment(probe);
  alert = uncomment(alert);
  const crons = [...probe.matchAll(/cron:\s*["']([^"']+)["']/g)].map((match) => match[1]);
  assert.equal(crons.length, 1, "Exactly one uptime cadence is required");
  const [minutes, ...rest] = crons[0].split(" ");
  assert.deepEqual(rest, ["*", "*", "*", "*"], "Uptime must run every hour and day");
  const step = /^\*\/(\d+)$/.exec(minutes);
  let slots;
  if (minutes === "*") slots = Array.from({ length: 60 }, (_, i) => i);
  else if (step) {
    const size = Number(step[1]);
    assert.ok(size >= 1 && size <= 15, "Uptime cadence must be at most 15 minutes");
    slots = Array.from({ length: Math.ceil(60 / size) }, (_, i) => i * size);
  } else {
    assert.match(minutes, /^\d+(,\d+)*$/, "Unrecognized minute expression");
    slots = [...new Set(minutes.split(",").map(Number))].sort((a, b) => a - b);
    assert.ok(slots.every((slot) => slot >= 0 && slot < 60));
  }
  assert.ok(slots.every((slot, i) => (slots[i + 1] ?? slots[0] + 60) - slot <= 15), "Uptime cadence must be at most 15 minutes");
  assert.match(probe, /name: Synthetic uptime\s*\n/);
  assert.match(probe, /run: node scripts\/run-synthetic-uptime\.mjs --origin https:\/\/www\.witnesstree\.ca --output synthetic-uptime-result\.json/);
  assert.doesNotMatch(probe, /^\s+[\w-]+:\s+write\s*$/m, "The probe must stay read-only");
  assert.match(probe, /if: always\(\)[\s\S]*actions\/upload-artifact@v\d+/);
  assert.match(alert, /workflow_run:\s*\n\s+workflows: \[Synthetic uptime\]\s*\n\s+types: \[completed\]\s*\n\s+branches: \[main\]/);
  assert.match(alert, /issues: write/);
  assert.match(alert, /group: synthetic-uptime-incident\s*\n\s+cancel-in-progress: false/);
  assert.match(alert, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(alert, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(alert, /ref: main\s*\n\s+persist-credentials: false/);
  assert.match(alert, /run: gh run download "\$UPTIME_RUN_ID" --name synthetic-uptime-result --dir uptime-receipt/);
  assert.match(alert, /- name: Alert after consecutive failures or close on recovery\s*\n\s+if: always\(\)\s*\n\s+env:\s*\n\s+GH_TOKEN: \$\{\{ github.token \}\}\s*\n\s+run: node scripts\/update-uptime-issue\.mjs --receipt uptime-receipt\/synthetic-uptime-result\.json/);
  return { cadenceMinutes: Math.max(...slots.map((slot, i) => (slots[i + 1] ?? slots[0] + 60) - slot)), failureThreshold: 2 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (name) => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
  console.log(JSON.stringify({ status: "passed", ...validateUptimeAlerting(read("synthetic-uptime"), read("synthetic-uptime-alert")) }));
}
