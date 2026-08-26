# Phase 1 AWS role session-duration readback

On 2026-08-25, the primary performed a read-only owner-authorized IAM role readback. The redacted record in `data/aws-role-max-session-readback-2026-08-25.json` records all nine existing Witness Tree archive roles at `MaxSessionDuration` 43,200 seconds. It contains no user identifier, email address, credential, access key, policy document, or role ARN.

This proves only the recorded maximum session duration. It does not prove a trust policy, object permission, manifest-retention permission, archive object, production admission, or deployment. Desired policy changes remain proposed until separately applied and read back.

SHA-256: `de48cfa4826887338cd437ab785fa10bb49c8a8a73a2214a2181c7af1dc21c3b`.
