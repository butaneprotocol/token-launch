import {
  Address,
  C,
  Data,
  Lucid,
  Script,
  TxComplete,
  UTxO,
  fromHex,
  fromText,
  toHex,
  toText,
  toUnit,
} from "lucid-cardano";
import {
  SaleTypes3,
  SaleTypes,
  BtnVest,
  SaleTypes2,
  SaleDeposit,
  SaleCollect,
  BtnMint,
} from "../plutus.ts";

export type BuiltValidator = {
  script: Script;
  policy: string;
};

export type DeployedValidator = BuiltValidator & {
  referenceUtxo: UTxO;
};

export type ScriptNames = "claiming" | "vesting" | "btn";
export type BuiltValidators = Record<ScriptNames, BuiltValidator>;
export type DeployedValidators = Record<ScriptNames, DeployedValidator>;
export type LaunchDetails = {
  genesisUTxO: UTxO;
  targetAddress: Address;
  adminUnit: string;
  mintTokenPol: string;
  mintTokenTn: string;
};
export type SaleDetails = SaleTypes3["_r"];
export const SaleDetails = SaleTypes3["_r"];
export type AdminState = SaleTypes["_r"];
export const AdminState = SaleTypes["_r"];

const tokenName = "BTN";
const tokenQty = 25000000n;
const tokenDecimals = 6n;
const tokenAmt = tokenQty * 10n ** tokenDecimals;

function numHex(num: bigint) {
  if (num == 0n) {
    return "";
  }
  let hex = num.toString(16);
  return hex.length % 2 === 0 ? hex : "0" + hex;
}

export function calculateProrata(
  deposited: bigint,
  price_n: bigint,
  price_d: bigint,
  totalAvailable: bigint,
  totalDeposited: bigint
) {
  let send: bigint;
  let receive: bigint;
  let refund: bigint;

  if (totalDeposited > totalAvailable) {
    let allocationProportion = (deposited * totalAvailable) / totalDeposited;
    send = allocationProportion;
    receive = (send * price_d) / price_n;
    refund = deposited - send;
  } else {
    send = deposited;
    receive = (send * price_d) / price_n;
    refund = 0n;
  }

  return { send, receive, refund };
}

export abstract class LaunchPad {
  lucid: Lucid;
  launchDetails: LaunchDetails;
  build?: BuiltValidators = undefined;
  deployment?: DeployedValidators = undefined;

  deployValidators: () => Promise<TxComplete>;

  async initialiseVesting() {
    if (!this.build) {
      throw new Error(
        "Cannot initialise the vested token supply without build details!"
      );
    }
    const initUTxO = this.launchDetails.genesisUTxO;

    const tx = await this.lucid
      .newTx()
      .collectFrom([initUTxO])
      .mintAssets(
        { [toUnit(this.build.vesting.policy, numHex(0n))]: tokenAmt },
        Data.to("Genesis", BtnVest["r"])
      )
      .attachMintingPolicy(this.build.vesting.script)
      .complete({ nativeUplc: true });

    return tx;
  }

  async adminUpdate(state: AdminState) {
    if (!this.launchDetails) {
      throw new Error("Cannot update the admin state without launch details!");
    }
    const ownAddress = await this.lucid.wallet.address();
    const tx = await this.lucid
      .newTx()
      .payToAddressWithData(
        ownAddress,
        { inline: Data.to(state, AdminState) },
        { [this.launchDetails.adminUnit]: 1n }
      )
      .complete();

    return tx;
  }

  async getDepositAddress() {
    if (!this.deployment) {
      throw new Error("Cannot get deposit address without deployment details!");
    }
    const ownWallet = this.lucid.utils.getAddressDetails(
      await this.lucid.wallet.address()
    );
    const ownHash = ownWallet.paymentCredential?.hash;
    if (!ownHash) {
      throw new Error("Wallet doesn't have payment credential!? 2");
    }
    return this.lucid.utils.credentialToAddress(
      { hash: this.deployment.claiming.policy, type: "Script" },
      { hash: ownHash, type: "Key" }
    );
  }

  async depositSale(lovelace: bigint, now?: number, addSigner?: boolean) {
    if (!this.deployment) {
      throw new Error("Cannot make sale without deployment details!");
    }
    const ownWallet = this.lucid.utils.getAddressDetails(
      await this.lucid.wallet.address()
    );
    const ownKeyHash = ownWallet.paymentCredential?.hash;
    if (!ownKeyHash) {
      throw new Error("Wallet doesn't have keyhash!?");
    }
    const ownReward = ownWallet.stakeCredential?.hash;
    if (!ownReward) {
      throw new Error("Wallet doesn't have reward!?");
    }
    const adminUTxO = await this.lucid.utxoByUnit(this.launchDetails.adminUnit);
    const adminDatum = Data.from(adminUTxO.datum!, SaleTypes["_r"]);
    if (typeof adminDatum == "string" || !("Live" in adminDatum)) {
      throw new Error("Admin datum must be in the live state!");
    }
    const details = Data.to(adminDatum.Live.details, SaleTypes3["_r"]);
    const detailsHash = toHex(C.hash_blake2b256(fromHex(details)));
    const tx = this.lucid
      .newTx()
      .readFrom([adminUTxO, this.deployment.claiming.referenceUtxo])
      .payToContract(
        await this.getDepositAddress(),
        {
          inline: Data.to(
            {
              recipient: {
                paymentCredential: { VerificationKeyCredential: [ownKeyHash] },
                stakeCredential: {
                  Inline: [{ VerificationKeyCredential: [ownReward] }],
                },
              },
              lockedLovelace: lovelace,
              detailsHash,
              expiryTime: adminDatum.Live.details.expiryTime,
            },
            SaleTypes2["_r"]
          ),
        },
        { lovelace: lovelace, [this.deployment.claiming.policy]: lovelace }
      )
      .mintAssets(
        { [this.deployment.claiming.policy]: lovelace },
        Data.to(
          {
            DepositRedeemer: {
              lovelaceSent: lovelace,
              adminOref: {
                transactionId: {
                  hash: adminUTxO.txHash,
                },
                outputIndex: BigInt(adminUTxO.outputIndex),
              },
            },
          },
          SaleDeposit["redeemer"]
        )
      )
      .validTo((now ?? Math.round(Date.now())) + 1000 * 1000);

    if (addSigner) {
      tx.addSigner(await this.lucid.wallet.address());
    }

    return tx.complete({ nativeUplc: false });
  }

  async claimSale(details: SaleDetails, now?: number, addSigner?: boolean, maxClaims?: number) {
    if (!this.deployment) {
      throw new Error("Cannot make claim sale without deployment details!");
    }
    //const ownAddress = await this.lucid.wallet.address();
    let depositedUtxos = await this.lucid.utxosAt(
      await this.getDepositAddress()
    );
    if (maxClaims!=undefined){
      depositedUtxos = depositedUtxos.slice(0, maxClaims)
    }
    const adminUTxO = await this.lucid.utxoByUnit(this.launchDetails.adminUnit);
    const adminDatum = Data.from(adminUTxO.datum!, SaleTypes["_r"]);
    if (typeof adminDatum == "string" || !("Closed" in adminDatum)) {
      throw new Error("Admin datum must be in the closed state!");
    }

    depositedUtxos.sort((a, b) => {
      let txCompare = a.txHash.localeCompare(b.txHash)
      if (txCompare==0){
        return a.outputIndex-b.outputIndex
      }
      return txCompare
    })

    const depositReturns = depositedUtxos.map((depositUTxO) => {
      const depositDatum = Data.from(depositUTxO.datum!, SaleTypes2["_r"]);
      return calculateProrata(
        depositDatum.lockedLovelace,
        details.priceN,
        details.priceD,
        details.totalExpectedAda,
        adminDatum.Closed.totalDepositedAda
      );
    });

    let tx = this.lucid
      .newTx()
      .readFrom([adminUTxO])
      .collectFrom(
        depositedUtxos,
        Data.to({ wrapper: Data.to(0n) }, SaleCollect["_redeemer"])
      );

    let claimTotal = 0n;
    let payTotal = 0n;
    let claimTokensTotal = 0n;
    console.log(depositedUtxos);
    for (let i = 0; i < depositedUtxos.length; i++) {
      const depositUTxO = depositedUtxos[i];
      const depositDatum = Data.from(depositUTxO.datum!, SaleTypes2["_r"]);
      const prorata = depositReturns[i];
      claimTotal += prorata.receive;
      payTotal += prorata.send;
      claimTokensTotal += depositDatum.lockedLovelace;

      tx = tx.payToAddress(
        this.lucid.utils.credentialToAddress(
          {
            hash: depositDatum.recipient.paymentCredential
              .VerificationKeyCredential![0],
            type: "Key",
          },
          {
            hash: depositDatum.recipient.stakeCredential!.Inline![0]
              .VerificationKeyCredential![0],
            type: "Key",
          }
        ),
        {
          lovelace: prorata.refund,
          [toUnit(
            this.launchDetails.mintTokenPol,
            this.launchDetails.mintTokenTn
          )]: prorata.receive,
        }
      );
    }
    console.log("VALUES: ", claimTotal, payTotal, claimTokensTotal)
    tx = tx
      .payToAddress(
        this.lucid.utils.credentialToAddress(
          this.lucid.utils.getAddressDetails(this.launchDetails.targetAddress)
            .paymentCredential!
        ),
        {
          lovelace: payTotal,
        }
      )
      .mintAssets(
        { [toUnit(this.deployment.claiming.policy, "")]: -claimTokensTotal },
        Data.to(
          {
            CollectRedeemer: {
              adminOref: {
                transactionId: {
                  hash: adminUTxO.txHash,
                },
                outputIndex: BigInt(adminUTxO.outputIndex),
              },
              outputIdx: 0n,
              claimTotal,
              details,
            },
          },
          SaleDeposit["redeemer"]
        )
      )
      .mintAssets(
        {
          [toUnit(
            this.launchDetails.mintTokenPol,
            this.launchDetails.mintTokenTn
          )]: claimTotal,
        },
        Data.to(
          {
            ClaimButane: [
              {
                transactionId: { hash: adminUTxO.txHash },
                outputIndex: BigInt(adminUTxO.outputIndex),
              },
            ],
          },
          BtnMint["r"]
        )
      )
      .readFrom([this.deployment.btn.referenceUtxo, this.deployment.claiming.referenceUtxo])
      .validTo((now ?? Math.round(Date.now())) + 1000 * 1000);

    if (addSigner) {
      tx.addSigner(await this.lucid.wallet.address());
    }

    return tx.complete({nativeUplc: false});
  }

  async unlockVest(
    time: bigint,
    now: number,
    amountOverride?: bigint,
    nativeUplcOverride?: boolean
  ) {
    if (!this.deployment) {
      throw new Error("Cannot unlock vest without deployment details!");
    }

    const vestToken = toUnit(this.deployment.vesting.policy, numHex(time));
    const walletUtxos = await this.lucid.wallet.getUtxos();

    let amount = 0n;
    if (amountOverride) {
      amount = amountOverride;
    } else {
      for (const utxo of walletUtxos) {
        amount += utxo.assets[vestToken] ?? 0n;
      }
      console.log("you fucked up!");
      return;
    }

    const tx = this.lucid
      .newTx()
      .mintAssets(
        {
          [vestToken]: -amount,
        },
        Data.to({ Unlock: [amount] }, BtnVest["r"])
      )
      .mintAssets(
        {
          [toUnit(this.deployment.btn.policy, fromText(tokenName))]: amount,
        },
        Data.to("UnvestButane", BtnMint["r"])
      )
      .validFrom(now)
      .readFrom([this.deployment.vesting.referenceUtxo])
      .readFrom([this.deployment.btn.referenceUtxo])
      .complete({ nativeUplc: nativeUplcOverride ?? true });
    return tx;
  }

  extendVest(from: bigint, to: bigint, amount: bigint) {
    if (!this.deployment) {
      throw new Error("Cannot extend vest without deployment details!");
    }

    const tx = this.lucid
      .newTx()
      .mintAssets(
        {
          [toUnit(this.deployment.vesting.policy, numHex(from))]: -amount,
          [toUnit(this.deployment.vesting.policy, numHex(to))]: amount,
        },
        Data.to("ExtendVest", BtnVest["r"])
      )
      .readFrom([this.deployment.vesting.referenceUtxo])
      .complete({ nativeUplc: true });

    return tx;
  }

  burnToken(amount: bigint) {
    if (!this.deployment) {
      throw new Error("Cannot extend vest without deployment details!");
    }

    const tx = this.lucid
      .newTx()
      .mintAssets(
        { [this.deployment.btn.policy]: -amount },
        Data.to("BurnButane", BtnMint["r"])
      )
      // .attachMintingPolicy(this.build.btn.script)
      .readFrom([this.deployment.btn.referenceUtxo])
      .complete({ nativeUplc: true });

    return tx;
  }
}

export class LaunchpadDeploying extends LaunchPad {
  lucid: Lucid;
  build?: BuiltValidators;
  deployment?: DeployedValidators;
  constructor(lucid: Lucid) {
    super();
    this.lucid = lucid;
  }

  buildValidators(
    initUTxO: UTxO,
    targetAddress: Address,
    adminPol: string,
    adminTn: string
  ) {
    const target_details = this.lucid.utils.getAddressDetails(targetAddress);

    const claimingScript = new SaleCollect(
      {
        paymentCredential: {
          VerificationKeyCredential: [target_details.paymentCredential!.hash],
        },
        stakeCredential: null,
      },
      adminPol,
      adminTn
    );
    const claimingPolicy = this.lucid.utils.mintingPolicyToId(claimingScript);
    const vestingScript = new BtnVest(
      {
        transactionId: { hash: initUTxO.txHash },
        outputIndex: BigInt(initUTxO.outputIndex),
      },
      tokenQty,
      tokenDecimals
    );
    const vestingPolicy = this.lucid.utils.mintingPolicyToId(vestingScript);
    const btnScript = new BtnMint(
      vestingPolicy,
      adminPol,
      adminTn,
      fromText(tokenName)
    );
    const btnPolicy = this.lucid.utils.mintingPolicyToId(btnScript);

    this.build = {
      claiming: {
        script: claimingScript,
        policy: claimingPolicy,
      },
      vesting: {
        script: vestingScript,
        policy: vestingPolicy,
      },
      btn: {
        script: btnScript,
        policy: btnPolicy,
      },
    } as BuiltValidators;

    this.launchDetails = {
      genesisUTxO: initUTxO,
      targetAddress,
      adminUnit: toUnit(adminPol, adminTn),
      mintTokenPol: btnPolicy,
      mintTokenTn: fromText(tokenName),
    };
  }

  deployValidators = async () => {
    if (!this.build) {
      throw new Error("Cannot deploy validators before building!");
    }
    // Script to lock at
    const ns: Script = this.lucid.utils.nativeScriptFromJson({
      type: "before",
      slot: 0,
    });
    const lockScript = this.lucid.utils.validatorToAddress(ns);
    // Build deploying TX.
    const tx = await this.lucid
      .newTx()
      .payToAddressWithData(
        lockScript,
        { scriptRef: this.build.claiming.script },
        {}
      )
      .payToAddressWithData(
        lockScript,
        { scriptRef: this.build.vesting.script },
        {}
      )
      .payToAddressWithData(
        lockScript,
        { scriptRef: this.build.btn.script },
        {}
      )
      .complete();
    // Order is maintained, so idx 0,1,2 are claiming,vesting,btn
    const txHash = tx.toHash();

    return tx;
  };
}

export class LaunchpadDeployed extends LaunchPad {
  lucid: Lucid;
  build: BuiltValidators;
  deployment: DeployedValidators;
  constructor(lucid: Lucid, deployment: DeployedValidators) {
    super();
    this.lucid = lucid;
    this.deployment = deployment;
    this.build = deployment;
  }
  deployValidators = async () => {
    throw new Error("Cannot deploy validators using predeployed variant!");
  };
}
