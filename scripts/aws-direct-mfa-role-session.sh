#!/bin/zsh
# Source only from an owner-local archive runner. This helper obtains one
# direct MFA-authenticated role session; it never bootstraps temporary user
# credentials and never assumes a role from an assumed role.

WT_AWS_ROLE_SESSION_SECONDS=43200

wt_assume_direct_mfa_role() {
  local profile="$1" account="$2" role="$3" session_name="$4"
  local identity mfa_serial totp response
  identity="$(aws sts get-caller-identity --profile "$profile" --output json)" || fail "Configured operator identity could not be verified; no AWS call was made" 77
  jq -e --arg account "$account" '.Account == $account and .Arn == ("arn:aws:iam::" + $account + ":user/WitnessTreeArchiveOperator")' <<<"$identity" >/dev/null || fail "Configured profile is not the exact approved operator; no AWS call was made" 77
  mfa_serial="$(aws configure get mfa_serial --profile "$profile" 2>/dev/null || true)"
  [[ "$mfa_serial" =~ ^arn:aws:iam::${account}:mfa/[A-Za-z0-9+=,.@_/-]+$ ]] || fail "Configured MFA serial is absent, malformed, or outside the approved account; no STS or AWS call was made" 69
  read -r -s 'totp?Current MFA TOTP (not stored): '; print
  [[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
  response="$(aws sts assume-role --profile "$profile" --role-arn "arn:aws:iam::${account}:role/${role}" --role-session-name "$session_name" --serial-number "$mfa_serial" --token-code "$totp" --duration-seconds "$WT_AWS_ROLE_SESSION_SECONDS" --output json)" || fail "Direct MFA role assumption failed; no AWS storage call was made" 77
  unset identity mfa_serial totp
  jq -e --arg account "$account" --arg role "$role" '.AssumedRoleUser.Arn | type == "string" and startswith("arn:aws:sts::" + $account + ":assumed-role/" + $role + "/")' <<<"$response" >/dev/null || fail "Direct MFA role response is not the approved role; no AWS storage call was made" 77
  print -r -- "$response"
}
