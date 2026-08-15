import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {dryRunLines, validate, validateIamDesiredState} from "../scripts/prepare-wildfire-derived-immutable-promotion.mjs";
test("derived wildfire promotion contract is exact, quarantined, and non-admitting", () => { const p=validate(); const lines=dryRunLines(p).join("\n"); assert.match(lines,/216-feature/); assert.match(lines,/188-feature/); assert.match(lines,/ADMISSION-BLOCK bc-wildfire/); assert.match(lines,/ADMISSION-BLOCK on-fire-disturbance/); assert.equal(p.artifacts[0].lineage.quarantined,"V10755"); assert.equal(p.claims.productionEligible,false); });
test("derived runner is MFA-gated and implements only the approved direct object flow", () => { const r=readFileSync(new URL("../scripts/run-wildfire-derived-approved-promotion.sh",import.meta.url),"utf8"); assert.match(r,/WitnessTreeWildfireDerivedPromotionUploader/); assert.match(r,/get-session-token/); assert.match(r,/assume-role/); assert.match(r,/put-object/); assert.match(r,/head-object/); assert.match(r,/put-object-retention/); assert.match(r,/get-object-retention/); assert.match(r,/--version-id/); assert.match(r,/FULL_OBJECT/); assert.match(r,/CRC64NVME/); assert.doesNotMatch(r,/DeleteObject|BypassGovernanceRetention|PutObjectLegalHold|AbortMultipartUpload|create-multipart-upload|upload-part/); });
test("proposed derived IAM is MFA-only and limited to four exact keys with payload-only retention", () => { const desired=validateIamDesiredState(); const [objects,retention]=desired.rolePolicy.Statement; assert.equal(objects.Resource.length,4); assert.equal(retention.Resource.length,2); assert.ok([...objects.Resource,...retention.Resource].every((key)=>key.includes("/derived/") && !key.includes("*"))); });

test("masked TOTP reaches only the exact mocked derived PutObject boundary", () => {
  const dir=mkdtempSync(join(tmpdir(),"wildfire-derived-runner-"));
  const marker=join(dir,"calls");
  const aws=join(dir,"aws");
  writeFileSync(aws,`#!/bin/zsh
print -- "$*" >> ${JSON.stringify(marker)}
if [[ "$1:$2" == "configure:get" ]]; then print -- "arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device"; exit 0; fi
if [[ "$1:$2" == "sts:get-session-token" ]]; then print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}'; exit 0; fi
if [[ "$1:$2" == "sts:get-caller-identity" && "$*" == *"--query Account"* ]]; then print -- "286853118812"; exit 0; fi
if [[ "$1:$2" == "sts:get-caller-identity" && "$*" == *"--query Arn"* ]]; then print -- "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"; exit 0; fi
if [[ "$1:$2" == "sts:assume-role" ]]; then print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}'; exit 0; fi
if [[ "$1:$2" == "s3api:head-object" ]]; then print -u2 -- "An error occurred (404) when calling the HeadObject operation: Not Found"; exit 255; fi
if [[ "$1:$2" == "s3api:put-object" ]]; then exit 88; fi
exit 98
`,{mode:0o700});
  const runner=new URL("../scripts/run-wildfire-derived-approved-promotion.sh",import.meta.url).pathname;
  const expectProgram=`set timeout 120
set env(PATH) "${dir}:$env(PATH)"
spawn -noecho zsh "${runner}" --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  try {
    const run=spawnSync("expect",["-c",expectProgram],{encoding:"utf8",timeout:120_000,env:{...process.env,PATH:`${dir}:${process.env.PATH}`}});
    assert.equal(run.status,70,`${run.stdout}\n${run.stderr}`);
    const calls=readFileSync(marker,"utf8");
    assert.match(calls,/configure get mfa_serial --profile WitnessTreeArchiveOperator/);
    assert.match(calls,/sts get-session-token/);
    assert.match(calls,/sts assume-role --role-arn arn:aws:iam::286853118812:role\/WitnessTreeWildfireDerivedPromotionUploader/);
    assert.match(calls,/s3api head-object/);
    assert.match(calls,/s3api put-object/);
    assert.doesNotMatch(calls,/iam |list-mfa|DeleteObject|BypassGovernanceRetention|PutObjectLegalHold/i);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`,/123456/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
