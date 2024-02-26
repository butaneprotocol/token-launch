pub type ProrataCalculation {
  ProrataCalculation { send: Int, receive: Int, refund: Int }
}

const dec = 1_000_000

pub fn calculate_values(
  deposited: Int,
  price_n: Int,
  price_d: Int,
  total_available: Int,
  total_deposited: Int,
) {
  if total_deposited > total_available {
    let allocation_proportion = deposited * total_available / total_deposited
    let send = allocation_proportion
    let receive = send * price_d / price_n
    let refund = deposited - send
    ProrataCalculation { send, receive, refund }
  } else {
    let send = deposited
    let receive = send * price_d / price_n
    let refund = 0
    ProrataCalculation { send, receive, refund }
  }
}

test value_calculator_over_5000() {
  calculate_values(5000 * dec, 90, 100, 9_675_000, 15_000_000) == ProrataCalculation {
    send: 3225000000,
    receive: 3583333333,
    refund: 1775000000,
  }
}

test value_calculator_over_666() {
  calculate_values(666 * dec, 90, 100, 9_675_000, 15_000_000) == ProrataCalculation {
    send: 429570000,
    receive: 477300000,
    refund: 236430000,
  }
}

test calculate_values_under() {
  calculate_values(5000 * dec, 90, 100, 9_675_000, 9_675_000) == ProrataCalculation {
    send: 5000 * dec,
    receive: 5555555555,
    refund: 0,
  }
}
