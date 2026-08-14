# Phase 1 archive identity preflight

**Status:** read-only preflight complete on 2026-08-14. This document records an identity decision for the archive-controls plan; it does not create or change any AWS identity.

## Observed configuration

The account is standalone: AWS Organizations is not enabled. The read-only IAM inventory found no IAM users, SAML providers, or OpenID Connect providers; it found only AWS service-linked roles, none suitable for a human or archive workload. No IAM Identity Center instance was found in the Canadian Region. The session used for the preflight was the account root principal, and account-level root MFA was not enabled. Identifiers are deliberately omitted.

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
- a registered MFA device before any role assumption is allowed;
- a policy limited to `sts:GetSessionToken` and `sts:AssumeRole` for exactly `WitnessTreeArchiveUploader` and `WitnessTreeArchiveRetentionBreakGlass`;
- access credentials, if needed for the CLI bootstrap, stored only in the owner-approved secret store and used to obtain an MFA-authenticated temporary session before `AssumeRole`; and
- a named custodian, key-rotation/revocation procedure, and logged quarterly access review.

The uploader and break-glass trust policies both require that exact user ARN and `aws:MultiFactorAuthPresent=true`. The execution validator requires the same runtime ARN but never records it in Git. The break-glass role remains restricted to dedicated legal-hold exercise keys; it is not a routine administrator role.

This is a transitional single-account control. If a second operator, account, or material production workload is introduced, stop and migrate to an owner-approved IAM Identity Center organization design rather than proliferating IAM users.
