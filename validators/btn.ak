use aiken/dict
use aiken/interval.{Finite}
use aiken/list
use aiken/math
use aiken/transaction.{
  InlineDatum, Input, Mint, Output, OutputReference, ScriptContext, Transaction,
}
use aiken/transaction/value.{PolicyId}
use launchpad/types.{AdminDatum, Closed, CollectRedeemer, SaleRedeemer}
use launchpad/utils.{assert}

type BtnRedeemer {
  BurnButane
  ClaimButane(OutputReference)
  UnvestButane
}

validator(
  vesting_policy: PolicyId,
  admin_pol: ByteArray,
  admin_tn: ByteArray,
  token_name: ByteArray,
) {
  fn mint(r: BtnRedeemer, ctx: ScriptContext) {
    when r is {
      BurnButane -> {
        // should only burn butane, 
        expect ScriptContext {
          transaction: Transaction { mint, .. },
          purpose: transaction.Mint(own_pid),
        } = ctx
        expect [(_, amt)] =
          mint
            |> value.from_minted_value
            |> value.tokens(own_pid)
            |> dict.to_list
        (amt < 0)?
      }
      ClaimButane(admin_oref) -> {
        expect ScriptContext {
          transaction: Transaction { redeemers, reference_inputs, mint, .. },
          purpose: transaction.Mint(own_pid),
        } = ctx
        expect Some(Input {
          output: Output {
            value: admin_nft_value,
            datum: InlineDatum(admin_nft_datum),
            ..
          },
          ..
        }) =
          reference_inputs
            |> list.find(fn(inp) { inp.output_reference == admin_oref })
        expect Closed { sale_hash: claiming_policy, .. }: AdminDatum =
          admin_nft_datum
        expect Some(claiming_redeemer) =
          redeemers |> dict.get(Mint(claiming_policy))
        expect CollectRedeemer { claim_total: claiming_amount, .. }: SaleRedeemer =
          claiming_redeemer
        expect [(tn, amt)] =
          mint
            |> value.from_minted_value
            |> value.tokens(own_pid)
            |> dict.to_list
        and {
          tn == token_name,
          amt == claiming_amount,
          assert(
            value.quantity_of(admin_nft_value, admin_pol, admin_tn) == 1,
            @"The admin UTxO must contain the admin NFT!",
          ),
        }
      }
      UnvestButane -> {
        expect ScriptContext {
          transaction: Transaction { redeemers, mint, .. },
          purpose: transaction.Mint(own_pid),
        } = ctx
        expect Some(vesting_redeemer) =
          redeemers |> dict.get(Mint(vesting_policy))
        expect Unlock(unlocking_amount): VestRedeemer = vesting_redeemer
        expect [(tn, amt)] =
          mint
            |> value.from_minted_value
            |> value.tokens(own_pid)
            |> dict.to_list
        and {
          (tn == token_name)?,
          (amt == unlocking_amount)?,
        }
      }
    }
  }
}

type VestRedeemer {
  BurnVested
  Genesis
  Unlock(Int)
  ExtendVest
}

// Spec:
// Mint 1 time supply of vested tokens
// Extend the vest of any tokens
// Unlock any tokens into raw BTN
validator(init_utxo: OutputReference, qty: Int, decimals: Int) {
  fn vest(r: VestRedeemer, ctx: ScriptContext) {
    when r is {
      BurnVested -> {
        // should only burn!
        expect ScriptContext {
          transaction: Transaction { mint, .. },
          purpose: transaction.Mint(own_pid),
        } = ctx
        expect [(_, amt)] =
          mint
            |> value.from_minted_value
            |> value.tokens(own_pid)
            |> dict.to_list
        (amt < 0)?
      }
      Genesis -> {
        expect ScriptContext {
          transaction: Transaction { inputs, mint, .. },
          purpose: transaction.Mint(own_pid),
        } = ctx
        expect
          inputs
            |> list.any(fn(inp) { inp.output_reference == init_utxo })
        expect [(tn, amt)] =
          mint
            |> value.from_minted_value
            |> value.tokens(own_pid)
            |> dict.to_list
        and {
          (tn == #[])?,
          (amt == qty * math.pow(10, decimals))?,
        }
      }
      Unlock(unlock_amt) -> {
        expect ScriptContext {
          transaction: Transaction { mint, validity_range, .. },
          purpose: transaction.Mint(own_pid),
        } = ctx
        expect [(token_name, amt)] =
          mint
            |> value.from_minted_value
            |> value.tokens(own_pid)
            |> dict.to_list
        expect Finite(lower_bound) = validity_range.lower_bound.bound_type
        and {
          utils.integer_gt_bytearray(lower_bound, token_name)?,
          (amt < 0)?,
          (unlock_amt + amt == 0)?,
        }
      }
      ExtendVest -> {
        // Extend vest is to increase the bytearray at any time, with the same qty
        // So no casts to number are needed
        expect ScriptContext {
          transaction: Transaction { mint, .. },
          purpose: transaction.Mint(own_pid),
        } = ctx
        expect [(vest_1, amt), (vest_2, amt_2)] = {
          expect [(vest_1, amt), (vest_2, amt_2)] =
            mint
              |> value.from_minted_value
              |> value.tokens(own_pid)
              |> dict.to_list
          if amt < 0 {
            [(vest_1, amt), (vest_2, amt_2)]
          } else {
            [(vest_2, amt_2), (vest_1, amt)]
          }
        }
        and {
          (utils.bytearray_to_integer(vest_1) < utils.bytearray_to_integer(
            vest_2,
          ))?,
          (amt < 0)?,
          (amt + amt_2 == 0)?,
        }
      }
    }
  }
}
