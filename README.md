# Launchpad Validators

This repository contains the smart contracts for the Launchpad Validators.

This was audited with the understanding that it would be closed source during the sale and so the risks around the sale.ak file were lower. Now it is open-source, greater caution should be taken and further auditing or testing is recommended.

# Suggestions for improvements (feel free to PR):
- Split claiming / ada collection
- Tests / offchain for state machine
- Fixes in sale.ak

# Known Issues
- Address bytearray lengths aren't validated in deposit, so it's possible with bad offchain a user locks their own funds

# Audit

Thanks to Pi (Sundaeswap) for his help increasing our security assurances. We caught bugs and significantly improved the reliability of the contracts thank to him. Report available https://cdn.sundaeswap.finance/butane-sale.pdf