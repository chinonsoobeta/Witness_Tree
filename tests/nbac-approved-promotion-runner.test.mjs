import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/run-nbac-approved-promotion.sh", import.meta.url), "utf8");

test("NBAC runner is external-root, MFA-role and exact-key bound", () => {
  assert.match(source, /\/Volumes\/Extended_SSD\/Witness_Tree-data/);
  assert.match(source, /ROLE="WitnessTreeArchivePromotionUploader"/);
  assert.match(source, /wt_assume_direct_mfa_role "\$PROFILE" 286853118812 "\$ROLE"/);
  assert.match(source, /c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/);
  assert.match(source, /--if-none-match '\*'/);
  assert.match(source, /check-nbac-archive-iam-applied\.mjs" --verify-live/);
  assert.match(source, /cp "\$RAW" "\$STAGED"/);
  assert.match(source, /--body "\$STAGED"/);
  assert.match(source, /--object-lock-mode COMPLIANCE --object-lock-retain-until-date "\$RETAIN_UNTIL"/);
  assert.match(source, /if put="\$\(aws s3api put-object[\s\S]*--if-none-match '\*'/);
  assert.match(source, /wt_archive_head_current_or_absent "\$PAYLOAD_KEY" nbac-payload/);
  assert.match(source, /wt_archive_head_current_or_absent "\$MANIFEST_KEY" nbac-manifest/);
  assert.doesNotMatch(source, /payload_present|manifest_present/);
  assert.doesNotMatch(source, /--profile root|arn:aws:iam::286853118812:root/);
});

test("NBAC runner retains payload and manifest without delete or bypass", () => {
  assert.equal((source.match(/wt_archive_ensure_compliance_retention/g) ?? []).length, 2);
  assert.doesNotMatch(source, /delete-object|bypass-governance-retention/i);
});
