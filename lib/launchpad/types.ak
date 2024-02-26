use aiken/transaction.{OutputReference}
use aiken/transaction/credential.{Address}

pub type LaunchDetails {
  total_expected_ada: Int,
  price_n: Int,
  price_d: Int,
  mint_token_pol: ByteArray,
  mint_token_tn: ByteArray,
  expiry_time: Int,
}

// Offchain flow:
// Starts in pending
// Goes to live
// Goes back to pending (we count the number of participation)
// Goes to closed
pub type AdminDatum {
  Pending
  Live { details: LaunchDetails }
  Counting
  Closed { total_deposited_ada: Int, sale_hash: ByteArray }
}

pub type DepositDatum {
  DepositDatum {
    recipient: Address,
    locked_lovelace: Int,
    details_hash: ByteArray,
    expiry_time: Int,
  }
}

pub type SaleRedeemer {
  DepositRedeemer { lovelace_sent: Int, admin_oref: OutputReference }
  CollectRedeemer {
    admin_oref: OutputReference,
    output_idx: Int,
    claim_total: Int,
    details: LaunchDetails,
  }
  ExpiryRedeemer
}
