import { Assets, Lucid, generatePrivateKey } from "lucid-cardano";

export async function generateAccount(assets: Assets) {
  const privateKey = generatePrivateKey();
  return {
    privateKey,
    address: await (await Lucid.new(undefined, "Custom"))
      .selectWalletFromPrivateKey(privateKey)
      .wallet.address(),
    assets,
  };
}

export type GeneratedAccount = Awaited<ReturnType<typeof generateAccount>>;