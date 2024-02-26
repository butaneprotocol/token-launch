import { Address, Emulator, Lucid, fromText, toUnit } from "lucid-cardano";
import { defaultProtocolParams } from "./constants";
import { generateAccount } from "./utils";
import { LaunchpadDeploying } from "../src/launchpad";

const adminPol = "0".repeat(56);
const adminTn = fromText("ADMIN");
const adminNft = toUnit(adminPol, adminTn);

describe("Synthetics", () => {
  let emulator: Emulator;
  let lucid: Lucid;
  let launchPad: LaunchpadDeploying;
  let treasuryAddress: Address;
  beforeEach(async () => {
    emulator = new Emulator([]);
    lucid = await Lucid.new(emulator);

    const ADMIN_USER = await generateAccount({
      lovelace: 100000000000000000n,
      [adminNft]: 1n,
    });

    const TREASURY_USER = await generateAccount({
      lovelace: 0n,
    });

    emulator = new Emulator([ADMIN_USER, TREASURY_USER], defaultProtocolParams);

    {
      lucid = await Lucid.new(emulator);
      lucid.selectWalletFromPrivateKey(TREASURY_USER.privateKey);
      treasuryAddress = await lucid.wallet.address();
    }

    lucid = await Lucid.new(emulator);
    lucid.selectWalletFromPrivateKey(ADMIN_USER.privateKey);
    {
      let firstAddress = lucid.utils.getAddressDetails(
        await lucid.wallet.address()
      );
      let newAddress = lucid.utils.credentialToAddress(
        firstAddress.paymentCredential!,
        firstAddress.paymentCredential!
      );
      lucid.wallet.address = async () => {
        return newAddress;
      };
    }
    const initUTxO = (await lucid.wallet.getUtxos())[0];
    console.log(
      `Initialising with the UTxO: ${initUTxO.txHash}:${initUTxO.outputIndex}`
    );
    launchPad = new LaunchpadDeploying(lucid);
    launchPad.buildValidators(initUTxO, treasuryAddress, adminPol, adminTn);
    emulator.awaitBlock();
    const vestingGenesisTx = await launchPad.initialiseVesting();
    (await vestingGenesisTx.sign().complete()).submit();
    emulator.awaitBlock();
    const deploymentTx = await launchPad.deployValidators();
    (await deploymentTx.sign().complete()).submit();
    emulator.awaitBlock();
    console.log("Initialisation Deployment complete");
  });

  it("Should be possible to extend vesting", async () => {
    const extendVestTx = await launchPad.extendVest(0n, 100n, 1000n);
    (await extendVestTx.sign().complete()).submit();

    it("Should be possible to extend vesting (complex!)", async () => {
      emulator.awaitBlock();
      const secondVestTx = await launchPad.extendVest(0n, 100n, 1000n);
      (await secondVestTx.sign().complete()).submit();
      emulator.awaitBlock();
      const combiningVestTx = await launchPad.extendVest(100n, 200n, 2000n);
      (await combiningVestTx.sign().complete()).submit();
    });
  });
  it("Should be possible to extend vesting (complex!)", async () => {
    const extendVestTx = await launchPad.extendVest(0n, 100n, 1000n);
    (await extendVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    const secondVestTx = await launchPad.extendVest(0n, 100n, 1000n);
    (await secondVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    const combiningVestTx = await launchPad.extendVest(100n, 200n, 2000n);
    (await combiningVestTx.sign().complete()).submit();
  });

  it("Shouldn't be possible to extend vesting illegally (complex!)", async () => {
    const extendVestTx = await launchPad.extendVest(0n, 100n, 1000n);
    (await extendVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    const secondVestTx = await launchPad.extendVest(0n, 100n, 1000n);
    (await secondVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    let success = false;

    expect(async () => {
      const combiningVestTx = await launchPad.extendVest(100n, 200n, 2001n);
      (await combiningVestTx.sign().complete()).submit();
    }).toThrow();
  });

  it("Should be possible to extend vesting (complex 2!)", async () => {
    const extendVestTx = await launchPad.extendVest(0n, 100n, 1000n);
    (await extendVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    const secondVestTx = await launchPad.extendVest(0n, 100n, 1000n);
    (await secondVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    const combiningVestTx = await launchPad.extendVest(100n, 200n, 2000n);
    (await combiningVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    const combiningVestTx2 = await launchPad.extendVest(200n, 300n, 2000n);
    (await combiningVestTx2.sign().complete()).submit();
  });

  it("Should be possible to extend vesting, do complex actions, and then unlock vesting.", async () => {
    const extendVestTx = await launchPad.extendVest(0n, 100n, 1000n);
    (await extendVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    const secondVestTx = await launchPad.extendVest(0n, 100n, 1000n);
    (await secondVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    const combiningVestTx = await launchPad.extendVest(100n, 200n, 2000n);
    (await combiningVestTx.sign().complete()).submit();
    emulator.awaitBlock();
    const combiningVestTx2 = await launchPad.extendVest(200n, 300n, 2000n);
    (await combiningVestTx2.sign().complete()).submit();
    emulator.awaitBlock(1000);
    const unlockingTx = await launchPad.unlockVest(300n, emulator.now());
    (await unlockingTx.sign().complete()).submit();
  });

  it("Sale e2e success", async () => {
    const cap = 9675n * 10n ** 3n * 10n ** 6n;
    let details = {
      totalExpectedAda: cap,
      priceN: 1n,
      priceD: 1n,
      mintTokenPol: launchPad.launchDetails.mintTokenPol,
      mintTokenTn: launchPad.launchDetails.mintTokenTn,
      expiryTime: 0n,
    };
    const beginTx = await launchPad.adminUpdate({
      Live: {
        details,
      },
    });
    (await beginTx.sign().complete()).submit();
    emulator.awaitBlock();
    const depositTx = await launchPad.depositSale(300n * 10n ** 6n);
    (await depositTx.sign().complete()).submit();
    emulator.awaitBlock();
    const closeTx = await launchPad.adminUpdate({
      Closed: {
        totalDepositedAda: cap,
        saleHash: launchPad.build!.claiming.policy,
      },
    });
    (await closeTx.sign().complete()).submit();
    emulator.awaitBlock();
    const claimTx = await launchPad.claimSale(details);
    (await claimTx.sign().complete()).submit();
    emulator.awaitBlock();
  });
});
