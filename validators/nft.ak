use aiken/dict
use aiken/list
use aiken/transaction.{Mint, OutputReference, ScriptContext, Transaction}
use aiken/transaction/value

// an admin NFT
// SPEC: MINT 1 ASSET EVER
// THEN ONLY BURN IT EVER ONCE
validator(init_oref: OutputReference) {
  fn nft(r: Int, ctx: ScriptContext) {
    expect ScriptContext {
      transaction: Transaction { inputs, mint, .. },
      purpose: Mint(own_pid),
    } = ctx
    expect [(tn_name, amt)] =
      mint
        |> value.from_minted_value
        |> value.tokens(own_pid)
        |> dict.to_list
    if r == 0 {
      and {
        (tn_name == "SaleAdmin")?,
        ((
          inputs
            |> list.find(fn(inp) { inp.output_reference == init_oref })
        ) != None)?,
        (amt == 1)?,
      }
    } else {
      amt == -1
    }
  }
}
