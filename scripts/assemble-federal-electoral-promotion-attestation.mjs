import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rollbackExclusivePublication, writeExclusiveMode600 } from "./assemble-qc-immutable-promotion-attestation.mjs";
import { redactFederalAttestation, validatePrivateFederalAttestation } from "./check-federal-electoral-promotion-attestation.mjs";

const fail = (message) => { throw new Error(message); };

export function assembleFederalAttestation({ capturePath, planPath, privatePath, publicPath }) {
  const plan = JSON.parse(readFileSync(resolve(planPath)));
  const privateValue = validatePrivateFederalAttestation(JSON.parse(readFileSync(resolve(capturePath))), plan);
  const publicValue = redactFederalAttestation(privateValue);
  let privatePublication;
  try {
    privatePublication = writeExclusiveMode600(resolve(privatePath), privateValue);
    writeExclusiveMode600(resolve(publicPath), publicValue);
  } catch {
    if (privatePublication && !rollbackExclusivePublication(privatePublication)) fail("attestation publication failed; inspect output state");
    fail("attestation publication failed without exposing provider values");
  }
  return publicValue;
}

if (process.argv[1]?.endsWith("assemble-federal-electoral-promotion-attestation.mjs")) {
  if (process.argv.length !== 6) fail("Usage: assembler <capture> <plan> <private-output> <public-output>");
  assembleFederalAttestation({ capturePath: process.argv[2], planPath: process.argv[3], privatePath: process.argv[4], publicPath: process.argv[5] });
  console.log("Federal electoral private/redacted attestation pair written owner-only.");
}
