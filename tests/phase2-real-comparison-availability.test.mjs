import assert from "node:assert/strict"; import { execFileSync } from "node:child_process"; import test from "node:test";
test("comparison availability remains non-numeric and non-causal",()=>assert.match(execFileSync("node",["scripts/check-phase2-real-comparison-availability.mjs"],{encoding:"utf8"}),/published nulls/));
