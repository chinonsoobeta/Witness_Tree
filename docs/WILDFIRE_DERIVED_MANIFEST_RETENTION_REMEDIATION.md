# Derived wildfire manifest-retention remediation

The BC and Ontario derived payloads have the required COMPLIANCE retention, but
the two exact deterministic manifests require a separate, manifest-only
remediation. This path never uploads, replaces, lists, deletes, changes IAM,
or touches a payload retention.

The owner first creates and reviews a private approval from the template, changes
only `status` to `owner-approved` and `approved` to `true`, then saves it mode
600. The remediation re-heads all four exact keys, pins their current versions,
requires the two manifest versions to have the exact no-retention provider
condition, re-checks each manifest current version immediately before its sole
`put-object-retention`, and records redacted mode-600 evidence.

~~~sh
node scripts/check-wildfire-derived-manifest-retention.mjs --approval-template \
  > /private/tmp/witness-tree-derived-manifest-retention-approval.json
chmod 600 /private/tmp/witness-tree-derived-manifest-retention-approval.json

zsh scripts/run-wildfire-derived-manifest-retention.sh --preflight \
  /private/tmp/witness-tree-derived-manifest-retention-approval.json \
  /private/tmp/witness-tree-derived-manifest-retention-evidence.json

zsh scripts/run-wildfire-derived-manifest-retention.sh --run \
  /private/tmp/witness-tree-derived-manifest-retention-approval.json \
  /private/tmp/witness-tree-derived-manifest-retention-evidence.json
~~~

`--run` prompts only after the local preflight passes. It writes COMPLIANCE
retention through `2033-08-12T00:00:00Z` only to the current pinned BC and
Ontario manifest versions, then reads both retentions and captures all four
version/checksum facts with identifiers hashed in the evidence file.
