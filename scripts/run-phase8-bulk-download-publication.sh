#!/bin/zsh
# Owner-local, MFA-gated publication of two exact content-addressed derived
# artifacts. It cannot list or delete objects and cannot write any other key.
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

PROFILE="WitnessTreeArchiveOperator"
ACCOUNT="286853118812"
ROLE="WitnessTreePublicDeliveryUploader"
REGION="ca-central-1"
BUCKET="witness-tree-public-delivery-ca-central-1"
DISTRIBUTION="d3g1406o0uekin.cloudfront.net"
RELEASE_ID="316af633de6a259554a79f46653481b5876ebed3be749e78b700e4aeeea0ee1f"
DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
RELEASE_DIR="$DATA_ROOT/derived/phase8-bulk-download-v1/$RELEASE_ID"
EVIDENCE="/private/tmp/witness-tree-phase8-bulk-download-publication-evidence.json"
TMP=""

CSV_FILE="$RELEASE_DIR/phase2-province-loss-2020-2022.csv"
CSV_SHA="a11fe16f3b6872b8928b13fc0eb62e19a7c8d1f6131f94eceffe76d89f23b1dd"
CSV_CHECKSUM="oR/hbztocriSixP8DrYuGafI0fYTH5Ts7/522J8jsd0="
CSV_SIZE="1786"
CSV_TYPE="text/csv; charset=utf-8"
CSV_KEY="releases/phase8-bulk-download-v1/$RELEASE_ID/downloads/phase2-province-loss-2020-2022.csv"

GPKG_FILE="$RELEASE_DIR/phase2-province-loss-2020-2022.gpkg"
GPKG_SHA="d5d8bb2b3eb92145277ffe5cf06387fd4d9705997c1b808c5975ec86e4db2b7a"
GPKG_CHECKSUM="1di7Kz65IUUnf/5c8GOH/U2XBZl8G4CMWXXshuTbK3o="
GPKG_SIZE="303104"
GPKG_TYPE="application/geopackage+sqlite3"
GPKG_KEY="releases/phase8-bulk-download-v1/$RELEASE_ID/downloads/phase2-province-loss-2020-2022.gpkg"

MANIFEST_FILE="$RELEASE_DIR/public-manifest.json"
MANIFEST_SHA="0d43fd90f3f8c522e2885922f838e56b6c28fe4e2d1f8f2ab72a15a0a209789d"
MANIFEST_CHECKSUM="DUP9kPP4xSLiiFki+Djla2wo/k4tH48qtyoVoKIJeJ0="
MANIFEST_SIZE="9811"
MANIFEST_TYPE="application/json"
MANIFEST_KEY="releases/phase8-bulk-download-v1/$RELEASE_ID/manifest.json"

fail() {
  local message="$1" exit_code="${2:-1}"
  print -u2 -- "Stopped: $message"
  exit "$exit_code"
}

cleanup() {
  local exit_code=$?
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN totp mfa_serial
  [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"
  exit "$exit_code"
}
trap cleanup EXIT

[[ $# -eq 1 && ("$1" == "--preflight" || "$1" == "--run") ]] || fail "Usage: $0 --preflight|--run" 64
command -v aws >/dev/null && command -v jq >/dev/null && command -v curl >/dev/null && command -v shasum >/dev/null || fail "aws, jq, curl, and shasum are required; no AWS call was made" 69
for item in "$CSV_FILE:$CSV_SHA:$CSV_SIZE" "$GPKG_FILE:$GPKG_SHA:$GPKG_SIZE" "$MANIFEST_FILE:$MANIFEST_SHA:$MANIFEST_SIZE"; do
  file="${item%%:*}"; remainder="${item#*:}"; expected_sha="${remainder%%:*}"; expected_size="${remainder##*:}"
  [[ -f "$file" && ! -L "$file" ]] || fail "Exact release artifact is absent or unsafe; no AWS call was made" 65
  [[ "$(stat -f %z "$file")" == "$expected_size" ]] || fail "Exact release artifact byte length drifted; no AWS call was made" 65
  [[ "$(shasum -a 256 "$file" | awk '{print $1}')" == "$expected_sha" ]] || fail "Exact release artifact checksum drifted; no AWS call was made" 65
done
identity="$(aws sts get-caller-identity --profile "$PROFILE" --output json)" || fail "Configured operator identity could not be verified; no storage call was made" 77
jq -e --arg account "$ACCOUNT" '.Account == $account and .Arn == ("arn:aws:iam::" + $account + ":user/WitnessTreeArchiveOperator")' <<<"$identity" >/dev/null || fail "Configured profile is not the exact operator; no storage call was made" 77
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>/dev/null || true)"
[[ "$mfa_serial" =~ ^arn:aws:iam::${ACCOUNT}:mfa/[A-Za-z0-9+=,.@_/-]+$ ]] || fail "Configured MFA serial is absent or outside the approved account; no storage call was made" 69
unset identity mfa_serial
if [[ "$1" == "--preflight" ]]; then
  print -- "PRECHECK passed: exact immutable CSV and GeoPackage bytes, operator identity, and MFA configuration are verified; no TOTP or storage call was made."
  exit 0
fi

TMP="$(mktemp -d /private/tmp/witness-tree-phase8-bulk-publication.XXXXXX)" || fail "Could not create private working directory" 69
chmod 700 "$TMP"
wt_assume_direct_mfa_role "$PROFILE" "$ACCOUNT" "$ROLE" "witness-tree-phase8-bulk-publication" >"$TMP/role-session.json"
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' "$TMP/role-session.json")"
export AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' "$TMP/role-session.json")"
export AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' "$TMP/role-session.json")"

publish_one() {
  local label="$1" file="$2" key="$3" sha="$4" checksum="$5" size="$6" type="$7" disposition="$8"
  local put_status=0
  aws s3api put-object \
    --bucket "$BUCKET" --key "$key" --body "$file" \
    --content-type "$type" --content-disposition "$disposition" \
    --cache-control "public,max-age=31536000,immutable" \
    --checksum-algorithm SHA256 --checksum-sha256 "$checksum" \
    --metadata "sha256=$sha,release-id=$RELEASE_ID,method-version=phase8-province-bulk-download-v2" \
    --if-none-match '*' --region "$REGION" --output json \
    >"$TMP/$label-put.json" 2>"$TMP/$label-put.stderr" || put_status=$?
  if [[ "$put_status" -ne 0 ]] && ! grep -q 'PreconditionFailed' "$TMP/$label-put.stderr"; then
    fail "Exact $label immutable write failed; private diagnostics are in $TMP" 70
  fi
  aws s3api head-object --bucket "$BUCKET" --key "$key" --checksum-mode ENABLED --region "$REGION" --output json >"$TMP/$label-head.json" 2>"$TMP/$label-head.stderr" || fail "Exact $label post-write readback failed; private diagnostics are in $TMP" 70
  jq -e --argjson size "$size" --arg type "$type" --arg checksum "$checksum" --arg sha "$sha" --arg release "$RELEASE_ID" '
    .ContentLength == $size and .ContentType == $type and .CacheControl == "public,max-age=31536000,immutable" and
    .ChecksumSHA256 == $checksum and .ServerSideEncryption == "AES256" and .Metadata.sha256 == $sha and
    .Metadata."release-id" == $release and .Metadata."method-version" == "phase8-province-bulk-download-v2"
  ' "$TMP/$label-head.json" >/dev/null || fail "Exact $label metadata or checksum readback drifted" 70
  url="https://$DISTRIBUTION/$key"
  curl --fail --silent --show-error --retry 5 --retry-delay 2 --dump-header "$TMP/$label-public.headers" --output "$TMP/$label-public.body" --write-out '%{http_code}' "$url" >"$TMP/$label-public.status" || fail "Public $label retrieval failed" 70
  [[ "$(cat "$TMP/$label-public.status")" == "200" ]] || fail "Public $label status was not 200" 70
  [[ "$(stat -f %z "$TMP/$label-public.body")" == "$size" ]] || fail "Public $label byte length drifted" 70
  [[ "$(shasum -a 256 "$TMP/$label-public.body" | awk '{print $1}')" == "$sha" ]] || fail "Public $label checksum drifted" 70
  print -r -- "$url" >"$TMP/$label-url"
}

publish_one csv "$CSV_FILE" "$CSV_KEY" "$CSV_SHA" "$CSV_CHECKSUM" "$CSV_SIZE" "$CSV_TYPE" 'attachment; filename="phase2-province-loss-2020-2022.csv"'
publish_one geopackage "$GPKG_FILE" "$GPKG_KEY" "$GPKG_SHA" "$GPKG_CHECKSUM" "$GPKG_SIZE" "$GPKG_TYPE" 'attachment; filename="phase2-province-loss-2020-2022.gpkg"'
publish_one manifest "$MANIFEST_FILE" "$MANIFEST_KEY" "$MANIFEST_SHA" "$MANIFEST_CHECKSUM" "$MANIFEST_SIZE" "$MANIFEST_TYPE" 'inline; filename="manifest.json"'

jq -n \
  --arg retrievedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg releaseId "$RELEASE_ID" --arg bucket "$BUCKET" --arg region "$REGION" --arg distribution "$DISTRIBUTION" \
  --arg csvUrl "$(cat "$TMP/csv-url")" --arg csvSha "$CSV_SHA" --argjson csvSize "$CSV_SIZE" --arg csvType "$CSV_TYPE" --arg csvCors "$(awk 'BEGIN{IGNORECASE=1} /^access-control-allow-origin:/ {gsub(/\r/,""); value=$2} END{print value}' "$TMP/csv-public.headers")" \
  --arg gpkgUrl "$(cat "$TMP/geopackage-url")" --arg gpkgSha "$GPKG_SHA" --argjson gpkgSize "$GPKG_SIZE" --arg gpkgType "$GPKG_TYPE" --arg gpkgCors "$(awk 'BEGIN{IGNORECASE=1} /^access-control-allow-origin:/ {gsub(/\r/,""); value=$2} END{print value}' "$TMP/geopackage-public.headers")" \
  --arg manifestUrl "$(cat "$TMP/manifest-url")" --arg manifestSha "$MANIFEST_SHA" --argjson manifestSize "$MANIFEST_SIZE" --arg manifestType "$MANIFEST_TYPE" --arg manifestCors "$(awk 'BEGIN{IGNORECASE=1} /^access-control-allow-origin:/ {gsub(/\r/,""); value=$2} END{print value}' "$TMP/manifest-public.headers")" \
  '{schemaVersion:"witness-tree/phase8-bulk-download-publication/1",status:"published-and-owner-local-readback",retrievalContext:"owner-local-producing-machine",retrievedAt:$retrievedAt,releaseId:$releaseId,region:$region,bucketName:$bucket,distributionDomainName:$distribution,artifacts:{csv:{publicUrl:$csvUrl,sha256:$csvSha,byteLength:$csvSize,contentType:$csvType,publicStatus:200,retrievedByteLength:$csvSize,fullPublicReadbackSha256:$csvSha,accessControlAllowOrigin:$csvCors},geopackage:{publicUrl:$gpkgUrl,sha256:$gpkgSha,byteLength:$gpkgSize,contentType:$gpkgType,publicStatus:200,retrievedByteLength:$gpkgSize,fullPublicReadbackSha256:$gpkgSha,accessControlAllowOrigin:$gpkgCors},manifest:{publicUrl:$manifestUrl,sha256:$manifestSha,byteLength:$manifestSize,contentType:$manifestType,publicStatus:200,retrievedByteLength:$manifestSize,fullPublicReadbackSha256:$manifestSha,accessControlAllowOrigin:$manifestCors}},controls:{mfaGatedExactRole:true,exactObjectCount:3,conditionalCreateOnly:true,deleteDenied:true,directPublicS3Read:false,cloudFrontReadback:true},claims:{technicalPreviewEligible:true,phase2ProductionGateComplete:false,perCellGeometryMaterialized:false},redaction:"No credentials, session material, MFA values, object version IDs, request IDs, ETags, or object bodies are recorded."}' >"$EVIDENCE"
chmod 600 "$EVIDENCE"
print -- "Publication completed. Redacted exact public-readback evidence: $EVIDENCE"
