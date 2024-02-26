import { Lucid, Maestro, fromText } from "lucid-cardano";
import { LaunchpadDeploying } from "../src/launchpad";

const lucid = await Lucid.new(
  new Maestro({
    apiKey: "",
    network: "Mainnet",
  }),
  "Mainnet"
);


if (!MAINNET_WALLET_PRIVATE_KEY) {
  throw new Error("MAINNET_WALLET_PRIVATE_KEY environment variable not set");
}

lucid.selectWalletFromPrivateKey(MAINNET_WALLET_PRIVATE_KEY);

const adminPol = "26cd051dbdad984cda7e624a25aecc1babc0c97e206b3fb98a97b4b8";
const adminTn = "SaleAdmin";

const initUTxO = (await lucid.wallet.getUtxos())[0];
console.log(
  `Initialising with the UTxO: ${initUTxO.txHash}:${initUTxO.outputIndex}`
);
const launchPad = new LaunchpadDeploying(lucid);
launchPad.buildValidators(initUTxO, adminPol, fromText(adminTn));

const vestingGenesisTx = await launchPad.initialiseVesting();
console.log("submitting vesting genesis tx");
(await vestingGenesisTx.sign().complete()).submit();
console.log("vesting genesis tx submitted");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

await sleep(60_000);

const deploymentTx = await launchPad.deployValidators();
console.log("submitting deployment tx");
(await deploymentTx.sign().complete()).submit();
console.log("deployment tx submitted");
