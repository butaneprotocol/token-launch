import { Blockfrost, Lucid, Maestro, fromText, toUnit } from "lucid-cardano";
import { LaunchpadDeploying } from "../src/launchpad";

const lucid = await Lucid.new(
  new Blockfrost(
    "https://cardano-mainnet.blockfrost.io/api/v0",
    ""
  ),
  "Mainnet"
);

if (!MAINNET_WALLET_PRIVATE_KEY) {
  throw new Error("MAINNET_WALLET_PRIVATE_KEY environment variable not set");
}

lucid.selectWalletFromPrivateKey(MAINNET_WALLET_PRIVATE_KEY);

// const tx = await lucid
//   .newTx()
//   .payToAddress(
//     "addr1qye93uefq8r6ezk0kzq443u9zht7ylu5nelvw8eracd200ylzvhpxn9c4g2fyxe5rlmn6z5qmm3dtjqfjn2vvy58l88szlpjw4",
//     {
//       [toUnit("26cd051dbdad984cda7e624a25aecc1babc0c97e206b3fb98a97b4b8", fromText("SaleAdmin"))]:
//         1n,
//     }
//   )
//   .complete();
// (await tx!.sign().complete()).submit();

const [initUtxo] = await lucid.utxosByOutRef([
  {
    txHash: "bcb26980cfc0f06bb8491c3556463d884a83904b53b4310e7d3171ee2063ec6c",
    outputIndex: 0,
  },
]);
console.log(initUtxo)
// const adminPol = "26cd051dbdad984cda7e624a25aecc1babc0c97e206b3fb98a97b4b8";
// const adminTn = "SaleAdmin";

// const launchPad = new LaunchpadDeploying(lucid);
// launchPad.buildValidators(initUtxo, adminPol, fromText(adminTn));

// const unlockingTx = await launchPad.unlockVest(
//   0n,
//   Date.now() - 100_000,
//   1n,
//   false
// );
// (await unlockingTx!.sign().complete()).submit();
