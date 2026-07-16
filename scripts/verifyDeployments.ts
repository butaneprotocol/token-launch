import {
  HexBlob,
  PlutusV2Script,
  Script,
  addressFromBech32,
} from "@blaze-cardano/core";
import {
  defineScriptDeployment,
  reconcileScriptDeployment,
} from "@blaze-cardano/deploy";
import { Blockfrost } from "@blaze-cardano/query";
import type { Script as LucidScript } from "lucid-cardano";
import { mainnetDeployment } from "../src/deployed";

const projectId = process.env.BLOCKFROST_PROJECT_ID?.trim();
if (!projectId) {
  throw new Error(
    "BLOCKFROST_PROJECT_ID is required to query Cardano mainnet.",
  );
}

const asBlazeScript = (name: string, script: LucidScript | undefined) => {
  if (!script || script.type !== "PlutusV2") {
    throw new Error(`${name} does not contain a Plutus V2 reference script.`);
  }
  return Script.newPlutusV2Script(
    PlutusV2Script.fromCbor(HexBlob(script.script)),
  );
};

const deployments = Object.entries(mainnetDeployment);
const expectedReferences = new Map(
  deployments.map(([name, deployment]) => [
    name,
    `${deployment.referenceUtxo.txHash}#${deployment.referenceUtxo.outputIndex}`,
  ]),
);

const manifest = defineScriptDeployment({
  id: "token-launch-mainnet",
  network: "cardano-mainnet",
  targets: deployments.map(([name, deployment]) => ({
    name,
    version: "1.0.0",
    script: asBlazeScript(name, deployment.referenceUtxo.scriptRef!),
    address: addressFromBech32(deployment.referenceUtxo.address),
    metadata: {
      referenceUtxo: `${deployment.referenceUtxo.txHash}#${deployment.referenceUtxo.outputIndex}`,
      source: "src/deployed.ts",
    },
  })),
});

const provider = new Blockfrost({
  network: "cardano-mainnet",
  projectId,
});
const plan = await reconcileScriptDeployment({ manifest, provider });
const failures: string[] = [];

console.log("Token Launch mainnet reference scripts");
console.log(`Manifest: ${plan.manifestHash}`);

for (const action of plan.actions) {
  if (action.type !== "reuse") {
    const name =
      action.type === "retire" ? action.record.name : action.target.name;
    failures.push(`${name}: expected reuse, got ${action.type}`);
    continue;
  }

  const expected = expectedReferences.get(action.target.name);
  const input = action.record.utxo?.input();
  const actual = input
    ? `${input.transactionId().toString()}#${input.index().toString()}`
    : undefined;

  if (!expected || actual !== expected) {
    failures.push(
      `${action.target.name}: expected ${expected ?? "a recorded reference"}, got ${actual ?? "no UTxO"}`,
    );
    continue;
  }

  console.log(
    `${action.target.name}: reuse ${action.record.scriptHash} at ${actual}`,
  );
}

if (failures.length > 0) {
  throw new Error(`Deployment verification failed:\n${failures.join("\n")}`);
}

console.log(`Verified ${manifest.targets.length} reference scripts.`);
