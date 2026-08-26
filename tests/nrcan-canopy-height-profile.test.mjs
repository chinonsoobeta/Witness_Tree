import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import test from "node:test"; import { validateNrcanCanopyHeightProfile } from "../scripts/check-nrcan-canopy-height-profile.mjs";
const profile=JSON.parse(readFileSync(new URL("../data/nrcan-canopy-height-profile.json",import.meta.url),"utf8"));
test("canopy-height profile is checksum-bound and staging-only",()=>assert.equal(validateNrcanCanopyHeightProfile(profile),profile));
test("canopy-height profile fails closed on byte or production drift",()=>{assert.throws(()=>validateNrcanCanopyHeightProfile({...profile,raw:{...profile.raw,byteLength:1}}));assert.throws(()=>validateNrcanCanopyHeightProfile({...profile,productionEligible:true}));});
