# Phase 1 archive identity preflight

**Status:** read-only preflight complete on 2026-08-14. This document records an identity decision for the archive-controls plan; it does not create or change any AWS identity.

## Observed configuration

The account is standalone: AWS Organizations is not enabled. The read-only IAM inventory found no IAM users, SAML providers, or OpenID Connect providers; it found only AWS service-linked roles, none suitable for a human or archive workload. No IAM Identity Center instance was found in the Canadian Region. The original preflight used the account root principal and found root MFA absent. The owner subsequently confirmed root MFA is enabled on 2026-08-14; this update is owner attestation, not routine root verification. Identifiers are deliberately omitted.

Therefore there is **no existing federation or trusted principal** that can safely assume `WitnessTreeArchiveUploader` or `WitnessTreeArchiveRetentionBreakGlass`. Routine root use is prohibited for this package.

## Options considered

| Option | Fit now | Decision |
| --- | --- | --- |
| New IAM Identity Center organization instance | Strongest long-term workforce access model, including AWS-account access, but requires creating and governing an AWS Organization. That is a material account-governance change for one archive. | Do not create it solely for Phase 1. Reconsider before adding accounts or operators. |
| Standalone IAM Identity Center account instance | A standalone account can host one, but account instances are for isolated managed-application access and do not provide AWS-account access-portal assignment. It does not solve the archive-role assumption path. | Not suitable. |
| Dedicated IAM user with no console password, MFA, and temporary role sessions | Smallest single-account bootstrap. The user can hold only `sts:AssumeRole` to the two archive roles and must pass MFA at each assumption. The roles then retain all S3 permissions. | **Recommended for Phase 1.** |

AWS documents that a standalone account can enable an Identity Center account instance, while only an organization instance supports AWS-account access management. AWS also documents MFA-protected `AssumeRole` with the `aws:MultiFactorAuthPresent` trust-policy condition. [IAM Identity Center instances](https://docs.aws.amazon.com/singlesignon/latest/userguide/identity-center-instances.html) · [AWS-account access](https://docs.aws.amazon.com/singlesignon/latest/userguide/manage-your-accounts.html) · [MFA-protected API access](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html)

## Required owner decision before execution

Approve creation and custody of **one** no-console IAM bootstrap user named `WitnessTreeArchiveOperator`. It must have:

- root MFA enabled first; root may be used only for this one-time bootstrap and emergency account recovery, never for routine archive operation;
- no console password, no administrative policy, and no direct S3/IAM/archive permissions;
- one owner-created **programmatic access key** for the CLI bootstrap. It is necessary because an IAM user with neither a console password nor an access key has no base credentials with which to call STS. The owner must never provide its secret to Codex, chat, Git, or a shared file;
- a registered **virtual/TOTP MFA device** before any role assumption is allowed. TOTP is required for the CLI `--token-code` flow; a passkey alone cannot supply that parameter;
- a policy limited to `sts:GetSessionToken` and `sts:AssumeRole` for exactly `WitnessTreeArchiveUploader` and `WitnessTreeArchiveRetentionBreakGlass`;
- that access key stored only in the owner-approved local credential store, configured locally with `aws configure --profile WitnessTreeArchiveOperator`, used only to obtain an MFA-authenticated temporary session before `AssumeRole`, and rotated or revoked immediately if exposed; and
- a named custodian, key-rotation/revocation procedure, and logged quarterly access review.

The uploader and break-glass trust policies both require that exact user ARN and `aws:MultiFactorAuthPresent=true`. The execution validator requires the same runtime ARN but never records it in Git. The break-glass role remains restricted to dedicated legal-hold exercise keys; it is not a routine administrator role.

This is a transitional single-account control. If a second operator, account, or material production workload is introduced, stop and migrate to an owner-approved IAM Identity Center organization design rather than proliferating IAM users.

## Owner-only CLI bootstrap and role-session flow

Do these steps in the AWS Console as the account owner; do not send any key, secret, QR code, TOTP code, or local credentials to Codex:

1. Open **IAM → Users → WitnessTreeArchiveOperator → Security credentials**. Confirm there is no console password. Under **Multi-factor authentication**, assign a **Virtual MFA device** and retain its TOTP seed only in the owner-approved authenticator.
2. Under **Access keys**, create exactly one key for **Command Line Interface (CLI)** use. Store the secret only in the owner-approved password manager or local credential store. Do not put it in Git, a ticket, chat, shell history, or an environment file.
3. On the owner-controlled machine, enter it only through `aws configure --profile WitnessTreeArchiveOperator` and set the default region to `ca-central-1`. In the IAM user’s **Assigned MFA device** details, copy the exact virtual-MFA device ARN and set it only on that machine with `aws configure set mfa_serial '<exact-assigned-virtual-MFA-ARN>' --profile WitnessTreeArchiveOperator`. Do not put the ARN in chat, Git, or a shared file. Verify the user identity locally with `aws sts get-caller-identity --profile WitnessTreeArchiveOperator`.
4. Obtain an MFA session locally (substitute the account ID only on the owner machine):

   ```sh
   aws sts get-session-token \
     --serial-number arn:aws:iam::<ACCOUNT_ID>:mfa/WitnessTreeArchiveOperator \
     --token-code <CURRENT_TOTP_CODE> \
     --profile WitnessTreeArchiveOperator \
     --output json
   ```

   Keep the returned temporary credentials local and short-lived. Use them, not the long-lived user key, as the source credentials for `aws sts assume-role` into `WitnessTreeArchiveUploader` or `WitnessTreeArchiveRetentionBreakGlass`. The roles' trust policies require `aws:MultiFactorAuthPresent=true`.
5. Use the uploader role for the tiny exercise upload and the break-glass role only for legal-hold ON/readback/OFF/readback. Preserve the CloudTrail records. Rotate the bootstrap access key after the exercise or at the owner's documented review interval; deactivate it before deletion and keep no second active key unless temporary rotation overlap is required.

Direct `AssumeRole` with the same long-lived user key plus `--serial-number` and `--token-code` also satisfies the roles' MFA trust condition, so `GetSessionToken` is optional at the AWS API level. This plan uses the explicit `GetSessionToken` step because it minimizes long-lived-key use after authentication and makes the MFA session boundary auditable.

## Owner-local exercise helper

After the roles and archive controls exist, run the committed helper in an owner-controlled Terminal:

```sh
scripts/run-phase1-archive-owner-exercise.sh --run --profile WitnessTreeArchiveOperator
```

It visibly prompts for the current TOTP before making an AWS call, then verifies the configured IAM-user profile. It requires the exact assigned virtual-MFA serial in that profile’s local `mfa_serial` setting; it deliberately does not guess a device name. It uses `GetSessionToken` followed by MFA-backed `AssumeRole`; no TOTP, secret, temporary credential, account identifier, ARN, or object version is printed or committed. Each AWS command has bounded connect/read timeouts and writes any potentially identifying diagnostic only to the private local evidence directory. The generated JSON contains only redacted control outcomes.

The helper uses the uploader role for one tiny dedicated exercise upload and a version-specific delete that must be denied. It uses the break-glass role only to set compliance retention and legal-hold status. The MFA-trusted, read-only `WitnessTreeArchiveVerifier` role reads legal-hold and retention before and after that change, and performs the CloudTrail-status and recovery-replica readbacks. A failed verifier readback is a recorded verification blocker—not permission to use root or broaden the roles.

If a prior run stopped after setting legal hold ON, use `scripts/run-phase1-archive-owner-exercise.sh --recover-latest` on the owner machine. It obtains an MFA session, has the verifier select only the newest version beneath `raw/legal-hold-exercises/`, reads the hold and COMPLIANCE retention, uses break-glass solely to set that hold OFF, then has the verifier confirm hold OFF and the same retention instant. It creates a redacted local recovery record and never deletes an object or changes retention.
