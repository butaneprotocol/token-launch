import { Blockfrost, Lucid, fromText, toHex, toUnit, Data } from "lucid-cardano"
import * as plutus from "./plutus"

const lucid = await Lucid.new(
    new Blockfrost(
      'https://cardano-mainnet.blockfrost.io/api/v0',
      ''
    ),
    'Mainnet',
  )

const utxo = lucid.utxosByOutRef([{txHash: "9fe7265c1022c6a68af14e7d4063b0f7a7832c58255a4a8d219f6fc5285c310a", outputIndex: 0}])

const nftScript = new plutus.NftNft({
    transactionId: {hash: "9fe7265c1022c6a68af14e7d4063b0f7a7832c58255a4a8d219f6fc5285c310a"},
    outputIndex: 0n
})
console.log(nftScript)

const policy = lucid.utils.mintingPolicyToId(nftScript)
const tokenName = fromText("SaleAdmin")
const tokenUnit = toUnit(policy, tokenName)

const tx = await lucid.newTx().mintAssets({
    [tokenUnit]: -1n
}, Data.to(1n)).complete()