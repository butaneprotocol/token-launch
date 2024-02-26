use aiken/builtin
use aiken/cbor
use aiken/dict
use aiken/interval.{Finite}
use aiken/list
use aiken/transaction.{
  InlineDatum, Input, Mint, NoDatum, Output, ScriptContext, Spend, Transaction,
}
use aiken/transaction/credential.{
  Address, Inline, ScriptCredential, VerificationKeyCredential,
}
use aiken/transaction/value
use launchpad/prorata
use launchpad/types.{
  AdminDatum, Closed, CollectRedeemer, Counting, DepositDatum, DepositRedeemer,
  ExpiryRedeemer, LaunchDetails, Live, Pending, SaleRedeemer,
}
use launchpad/utils.{assert}

const min_ada = 300_000_000

// Hoisted the recurse for old man pi
fn collection_recurser(
  cmp_details_hash: ByteArray,
  price_n: Int,
  price_d: Int,
  total_expected_ada: Int,
  total_deposited_ada: Int,
  own_pid: ByteArray,
  mint_token_pol: ByteArray,
  mint_token_tn: ByteArray,
  script_inputs: List<Input>,
  script_outputs: List<Output>,
  acc_mint: Int,
  acc_send: Int,
  acc_claim: Int,
) {
  when script_inputs is {
    [this_input, ..remaining_inputs] -> {
      // Expectations / parsing
      // Pop 1 output
      expect [this_output, ..other_outputs] = script_outputs
      // Parse the current input
      expect Input {
        output: Output { datum: InlineDatum(this_datum), value: this_value, .. },
        ..
      } = this_input
      // Parse the current input's datum
      expect DepositDatum { recipient, locked_lovelace, details_hash, .. }: DepositDatum =
        this_datum
      // Parse the popped output
      expect Output {
        value: return_value,
        address: return_address,
        datum: NoDatum,
        reference_script: None,
      } = this_output
      // Pro rata math util.
      let prorata.ProrataCalculation {
        send: must_send,
        receive: must_receive,
        refund: must_rebate,
      } =
        prorata.calculate_values(
          locked_lovelace,
          price_n,
          price_d,
          total_expected_ada,
          total_deposited_ada,
        )
      // Loop assertions
      trace cbor.diagnostic(return_value)
      trace cbor.diagnostic(must_rebate)
      trace cbor.diagnostic(must_receive)
      expect and {
          assert(
            cmp_details_hash == details_hash,
            @"Collecting details must be the same as the stored details!",
          ),
          assert(
            {
              expect [(_lovelace_pol, lovelace), (other_pol, other_dict)] =
                this_value |> value.to_dict |> dict.to_list
              and {
                // previously was validating that the input was the rebated value.
                // Now, we check it correctly corresponds to datum.
                (( lovelace |> dict.to_list ) == [("", locked_lovelace)])?,
                (other_pol == own_pid)?,
                // Jshy's ledger bug relevant here?
                (( other_dict |> dict.to_list ) != [])?,
              }
            },
            @"The local tokens dictionary must be a non-empty list!",
          ),
          assert(
            {
              expect [(_lovelace_pol, lovelace), (other_pol, other_dict)] =
                return_value |> value.to_dict |> dict.to_list
              expect [(_lovelace_tn, lovelace_amt)] = lovelace |> dict.to_list
              and {
                // turned into GE for minada!
                lovelace_amt >= must_rebate,
                other_pol == mint_token_pol,
                ( other_dict |> dict.to_list ) == [
                  (mint_token_tn, must_receive),
                ],
              }
            },
            @"The rebated value must be the calculated \"must_rebate\" + must_receive values!",
          ),
          assert(
            return_address == recipient,
            @"The returned value must be sent back to the recipient!",
          ),
        }
      // Next loop iteration
      collection_recurser(
        cmp_details_hash,
        price_n,
        price_d,
        total_expected_ada,
        total_deposited_ada,
        own_pid,
        mint_token_pol,
        mint_token_tn,
        remaining_inputs,
        other_outputs,
        acc_mint - locked_lovelace,
        acc_send + must_send,
        acc_claim + must_receive,
      )
    }
    [] -> {
      expect [final_output, ..] = script_outputs
      (acc_mint, acc_send, acc_claim, final_output)
    }
  }
}

// The purpose of this script is to record how much someone has paid (in ada)
// We do this by allowing them to mint tokens for however much they deposit to us
validator(
  target_recipient: Address,
  admin_pol: ByteArray,
  admin_tn: ByteArray,
) {
  fn deposit(redeemer: SaleRedeemer, ctx: ScriptContext) {
    // remove later
    when redeemer is {
      DepositRedeemer { lovelace_sent, admin_oref } -> {
        // Top level expectations / parsing
        expect ScriptContext {
          transaction: Transaction { outputs, mint, reference_inputs, .. },
          purpose: Mint(own_pid),
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
        expect Live { details }: AdminDatum = admin_nft_datum
        expect Some(Output {
          value: locked_value,
          datum: InlineDatum(locked_datum),
          address: Address(locked_paycred, Some(locked_stakecred)),
          reference_script: None,
        }) = list.head(outputs)
        expect DepositDatum {
          recipient: Address(deposit_recipient_pay, ..),
          locked_lovelace: deposited_lovelace,
          details_hash: deposit_details_hash,
          expiry_time: deposit_expiry_time,
        }: DepositDatum = locked_datum
        expect VerificationKeyCredential(..) = deposit_recipient_pay
        // Assertions
        and {
          deposit_expiry_time == details.expiry_time,
          assert(
            deposit_details_hash == builtin.blake2b_256(
              builtin.serialise_data(details),
            ),
            @"Depositing details must be the same as the live details!",
          ),
          // Admin checks
          assert(
            value.quantity_of(admin_nft_value, admin_pol, admin_tn) == 1,
            @"The admin UTxO must contain the admin NFT!",
          ),
          // Locked value checks
          assert(
            locked_paycred == ScriptCredential(own_pid),
            @"Locked value should be at lock script!",
          ),
          assert(
            locked_stakecred == Inline(deposit_recipient_pay),
            @"Recipient payment cred and locked stake cred should be the same.",
          ),
          assert(
            lovelace_sent == deposited_lovelace,
            @"Deposited lovelace should be equal to redeemer value.",
          ),
          // Note: may fail in offchain because of min ada. No onchain bug!
          assert(
            locked_value == (
              value.from_lovelace(lovelace_sent)
                |> value.add(own_pid, "", lovelace_sent)
            ),
            @"Recipient value must be equal to the lovelace_sent field in the redeemer!",
          ),
          assert(
            value.from_minted_value(mint) == value.from_asset(
              own_pid,
              "",
              lovelace_sent,
            ),
            @"Minted value must be correct!",
          ),
          assert(
            lovelace_sent >= min_ada,
            @"Recipient sent lovelace must be greater than the minimum amount of 300 ada!",
          ),
        }
      }
      CollectRedeemer { admin_oref, output_idx, claim_total, details } -> {
        let LaunchDetails {
          total_expected_ada,
          price_n,
          price_d,
          mint_token_pol,
          mint_token_tn,
          ..
        } = details
        let details_hash = builtin.blake2b_256(builtin.serialise_data(details))
        // Top level expectations / parsing
        expect ScriptContext {
          transaction: Transaction {
            outputs,
            mint,
            inputs,
            reference_inputs,
            ..
          },
          purpose: Mint(own_pid),
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
        expect Closed { total_deposited_ada, .. }: AdminDatum = admin_nft_datum
        let script_inputs =
          inputs
            |> list.filter(
                 fn(inp) {
                   inp.output.address.payment_credential == ScriptCredential(
                     own_pid,
                   )
                 },
               )
        // Loop over inputs, while popping outputs
        expect (
          expected_minted_value,
          expected_sent_value,
          expected_claim_value,
          Output {
            value: payed_value,
            datum: payed_datum,
            address: payed_address,
            reference_script: None,
          },
        ) =
          collection_recurser(
            details_hash,
            price_n,
            price_d,
            total_expected_ada,
            total_deposited_ada,
            own_pid,
            mint_token_pol,
            mint_token_tn,
            script_inputs,
            outputs |> list.drop(output_idx),
            0,
            0,
            0,
          )
        // Global assertions
        trace cbor.diagnostic(value.from_lovelace(expected_sent_value))
        trace cbor.diagnostic(payed_value)
        and {
          // Admin check
          assert(
            value.quantity_of(admin_nft_value, admin_pol, admin_tn) == 1,
            @"The admin UTxO must contain the admin NFT!",
          ),
          assert(
            expected_claim_value == claim_total,
            @"The minted token specified in the admin datum must be equivalent to the total claimed amount of that token.",
          ),
          assert(
            expected_minted_value < 0,
            @"Safety check: expected_minted_value < 0",
          ),
          assert(
            [("", expected_minted_value)] == (
              mint
                |> value.from_minted_value
                |> value.tokens(own_pid)
                |> dict.to_list
            ),
            @"The locally minted value must match the \"expected_minted_value\" variable!",
          ),
          assert(
            payed_value == value.from_lovelace(expected_sent_value),
            @"The payed value must be the calculated \"expected_sent_value\" variable!",
          ),
          assert(
            payed_address == target_recipient,
            @"The payed value must be sent back to the target!",
          ),
          assert(payed_datum == NoDatum, @"The payed value must have no datum!"),
        }
      }
      ExpiryRedeemer -> {
        expect ScriptContext {
          transaction: Transaction {
            mint,
            inputs,
            validity_range,
            extra_signatories,
            ..
          },
          purpose: Mint(own_pid),
        } = ctx
        let script_inputs =
          inputs
            |> list.filter(
                 fn(inp) {
                   inp.output.address.payment_credential == ScriptCredential(
                     own_pid,
                   )
                 },
               )
        expect [
          Input {
            output: Output {
              datum: InlineDatum(expired_datum),
              value: expired_value,
              ..
            },
            ..
          },
        ] = script_inputs
        expect [_ada, (locked_pol, locked_asset)] =
          expired_value |> value.to_dict |> dict.to_list
        expect [(burn_tn, expected_burn_amount)] = locked_asset |> dict.to_list

        expect DepositDatum {
          recipient: deposit_recipient,
          expiry_time: deposit_expiry_time,
          ..
        }: DepositDatum = expired_datum
        expect Finite(lower_bound) = validity_range.lower_bound.bound_type
        expect VerificationKeyCredential(key_hash) =
          deposit_recipient.payment_credential
        and {
          burn_tn == "",
          locked_pol == own_pid,
          assert(
            [("", -expected_burn_amount)] == (
              mint
                |> value.from_minted_value
                |> value.tokens(own_pid)
                |> dict.to_list
            ),
            @"The locally minted value must match the \"expected_burn_amount\" variable!",
          ),
          // PKH is in datum
          list.any(extra_signatories, fn(signer) { signer == key_hash }),
          // Expiry is valid
          lower_bound >= deposit_expiry_time,
        }
      }
    }
  }

  fn collect(_datum: Data, _redeemer: Data, ctx: ScriptContext) {
    // i.e, this script hash is always burnt
    expect ScriptContext {
      transaction: Transaction { inputs, mint, .. },
      purpose: Spend(own_oref),
    } = ctx
    expect Some(own_input) =
      list.find(inputs, fn(inp) { inp.output_reference == own_oref })
    expect ScriptCredential(own_hash) =
      own_input.output.address.payment_credential
    expect [(_, amt)] =
      mint |> value.from_minted_value |> value.tokens(own_hash) |> dict.to_list
    amt < 0
  }
}

// The correct initialisation state is in "Pending" with the admin NFT
validator(admin_key: ByteArray) {
  fn machine(d: AdminDatum, r: Int, ctx: ScriptContext) {
    expect ScriptContext {
      transaction: Transaction { outputs, inputs, mint, extra_signatories, .. },
      purpose: Spend(oref),
    } = ctx
    expect Some(Input {
      output: Output { value: own_value, address: own_address, .. },
      ..
    }) = list.find(inputs, fn(inp) { inp.output_reference == oref })
    let continuing_logic =
      fn(f: fn(Data) -> Bool) {
        expect Some(Output {
          value: continuing_value,
          address: continuing_address,
          datum: InlineDatum(continuing_datum),
          ..
        }) = outputs |> list.at(r)
        and {
          ((
            own_value
              |> value.without_lovelace
          ) == (
            continuing_value
              |> value.without_lovelace
          ))?,
          (own_address == continuing_address)?,
          f(continuing_datum),
        }
      }
    let burning_logic =
      fn() {
        expect [(own_token_pol, own_token_dict)] =
          own_value
            |> value.without_lovelace
            |> value.to_dict
            |> dict.to_list
        expect [(own_token_tn, 1)] = own_token_dict |> dict.to_list
        [(own_token_tn, -1)] == (
          mint
            |> value.from_minted_value
            |> value.tokens(own_token_pol)
            |> dict.to_list
        )
      }
    and {
      extra_signatories |> list.has(admin_key),
      when d is {
        Pending ->
          continuing_logic(
            fn(data) {
              expect Live { .. }: AdminDatum = data
              True
            },
          )
        Live { .. } ->
          continuing_logic(
            fn(data) {
              expect Counting: AdminDatum = data
              True
            },
          )
        Counting ->
          continuing_logic(
            fn(data) {
              expect Closed { .. }: AdminDatum = data
              True
            },
          )
        Closed { .. } -> burning_logic()
      },
    }
  }
}

validator {
  fn types(_r: AdminDatum, _ctx: ScriptContext) {
    True
  }
}

validator {
  fn types3(_r: LaunchDetails, _ctx: ScriptContext) {
    True
  }
}

validator {
  fn types2(_r: DepositDatum, _ctx: ScriptContext) {
    True
  }
}
