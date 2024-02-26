import {Lucid, Maestro, Script} from "lucid-cardano"

const lucid = await Lucid.new(
    new Maestro({
      apiKey: "",
      network: "Mainnet",
    }),
    "Mainnet"
  );
const ns: Script = lucid.utils.nativeScriptFromJson({
  type: 'before',
  slot: 0,
})
const lockScript = lucid.utils.validatorToAddress(ns)

console.log(await lucid.utxosAt(lockScript))