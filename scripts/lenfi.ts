import { Blockfrost, Lucid } from "lucid-cardano";

const lucid = await Lucid.new(
    new Blockfrost(
      "",
      ""
    ),
    "Mainnet"
  );


console.log(await lucid.utxosAt("addr1q9ke4j8upaynfgfp7w32jppvxgqn5py93nepw8j5gj36sfm0csl2jvufewsazwy9qj8eusvnjftxtf4mpqhxqx4xsdvq3k24r6"))