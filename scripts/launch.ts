import { Lucid, Maestro } from 'lucid-cardano'

const lucid = await Lucid.new(
  new Maestro({
    apiKey: '',
    network: 'Mainnet',
  }),
  'Mainnet',
)

if (!MAINNET_WALLET_PRIVATE_KEY) {
  throw new Error('MAINNET_WALLET_PRIVATE_KEY environment variable not set')
}

lucid.selectWalletFromPrivateKey(MAINNET_WALLET_PRIVATE_KEY)
console.log(await lucid.wallet.address())