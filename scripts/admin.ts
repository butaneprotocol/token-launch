import { Data, Lucid, Maestro, fromText, toUnit } from "lucid-cardano";
import { NftNft } from "../plutus";
import * as process from "process"

const lucid = await Lucid.new(
  new Maestro({
    apiKey: "",
    network: "Mainnet",
  }),
  "Mainnet"
);

const MAINNET_WALLET_PRIVATE_KEY = process.env.MAINNET_WALLET_PRIVATE_KEY

if (!MAINNET_WALLET_PRIVATE_KEY) {
  throw new Error("MAINNET_WALLET_PRIVATE_KEY environment variable not set");
}

lucid.selectWalletFromPrivateKey(MAINNET_WALLET_PRIVATE_KEY);

const initUTxO = (await lucid.wallet.getUtxos())[0];
console.log(
  `Initialising with the UTxO: ${initUTxO.txHash}:${initUTxO.outputIndex}`
);

const nftScript = new NftNft({
  transactionId: { hash: initUTxO.txHash },
  outputIndex: BigInt(initUTxO.outputIndex),
});
const pol = lucid.utils.validatorToScriptHash(nftScript);
const nftName = "SaleAdmin";
const adminUnit = toUnit(pol, fromText(nftName));

const tx = await lucid
  .newTx()
  .mintAssets(
    {
      [adminUnit]: 1n,
    },
    Data.to(0n)
  )
  .collectFrom([initUTxO])
  .attachMintingPolicy(nftScript)
  .complete();

await (await tx.sign().complete()).submit();