## [2.1.0](https://github.com/VenusProtocol/venus-protocol/compare/v2.0.1...v2.1.0) (2023-08-24)


### Features

* add access control to interest params ([66d65fe](https://github.com/VenusProtocol/venus-protocol/commit/66d65feb8afd3fc42685be39009822098f72b124))
* add deploy script for lens contracts ([cd80912](https://github.com/VenusProtocol/venus-protocol/commit/cd8091273432bb921328104049de4f0005d81b2a))
* add governance simulation framework ([57a909d](https://github.com/VenusProtocol/venus-protocol/commit/57a909d033fc981582f55b9c183f55e57d531d4a))
* add restrictions and allowlist to liquidations ([a3e5a39](https://github.com/VenusProtocol/venus-protocol/commit/a3e5a3938138913f7c4ec9cf5983b1ccec495e90))
* add semantic release to main ([7f28dc0](https://github.com/VenusProtocol/venus-protocol/commit/7f28dc0d705e9339ad27472c6e9ebd3e88a3e4a5))
* adjust GovernorBravo test cases according to vault change ([66642b6](https://github.com/VenusProtocol/venus-protocol/commit/66642b6bbf86a143d3fa9414ba3b9ba063ce22ee))
* customize docgen ([698b2bb](https://github.com/VenusProtocol/venus-protocol/commit/698b2bb5f5361e3516f5ae676c23aaf7bcff088c))
* make Liquidator upgradeable ([44c1f5a](https://github.com/VenusProtocol/venus-protocol/commit/44c1f5a49b0180bd1832b57c5bcec9c35745aca5))
* upgrade Liquidator Solidity version ([9788625](https://github.com/VenusProtocol/venus-protocol/commit/9788625958d282a27c20878fdebc5a665f70df84))


### Bug Fixes

* :shirt: ([ab2f2aa](https://github.com/VenusProtocol/venus-protocol/commit/ab2f2aa9e39f0b01d505c33c323cb44a314fd353))
* add vTokenBorrowed to the emitted event ([99a5099](https://github.com/VenusProtocol/venus-protocol/commit/99a50999a16fd4333924fafd0e810b30e8567fe3))
* avoid unnecessary multiplications ([711d775](https://github.com/VenusProtocol/venus-protocol/commit/711d775728e66a14f3fcbba340b4e30be4803f23))
* increase optimizer runs ([65d19e7](https://github.com/VenusProtocol/venus-protocol/commit/65d19e7dcb14fb4820dd837471236097229cd5ef))
* prevent VAI from compiling with 0.8 ([7723ee3](https://github.com/VenusProtocol/venus-protocol/commit/7723ee3dd5c24102bedadd96a0fb86be82bad5c7))
* Reentrancy issue. ([22cfee1](https://github.com/VenusProtocol/venus-protocol/commit/22cfee15d473c6c0cf9d0638f4e0641a309aefc5))
* remove duplicate import ([e220aec](https://github.com/VenusProtocol/venus-protocol/commit/e220aec2090af60aaeee778f58b70f13fe9b5ba7))
* set initial stability fee index for past minters ([199c045](https://github.com/VenusProtocol/venus-protocol/commit/199c045351bbfe59667402c1620140a0d9cf48ac))
* set path for hardhat-ethers ([28795b1](https://github.com/VenusProtocol/venus-protocol/commit/28795b1001119a85ac9a0f5ae303945c8c3ba66f))
* set timelock delays to time units ([4a29128](https://github.com/VenusProtocol/venus-protocol/commit/4a29128b0b71eac03eb6024ce31bc20767e31e26))
* update dependencies ([36b6e76](https://github.com/VenusProtocol/venus-protocol/commit/36b6e76ee022360f7421156ca9d0e4423215f4c5))
* update publish command ([2177df9](https://github.com/VenusProtocol/venus-protocol/commit/2177df93548c9437f78e2c57ab6805f96c6c6735))
* update the network files with the currently used addresses ([4eaa8ae](https://github.com/VenusProtocol/venus-protocol/commit/4eaa8aef5e6a3ece21e2116073efb4c6bf1c26d5))
* upgrade compiler and lock pragma version ([ed19a94](https://github.com/VenusProtocol/venus-protocol/commit/ed19a9407a457e73864de864088fde36be6142ba))
* use custom errors instead of error strings ([4208e85](https://github.com/VenusProtocol/venus-protocol/commit/4208e85199ae31084981b7887ec8de8b12ea2a41))
* xvs -> xvsVault in GovernerBravo cancellation test ([83ccbe0](https://github.com/VenusProtocol/venus-protocol/commit/83ccbe0d3538dff6642f747e1537bf78db6e6f20))


### Reverts

* Revert "Fix cache errors in scenario installation" ([9385dba](https://github.com/VenusProtocol/venus-protocol/commit/9385dba2a60028e59fdad143e9468413e168b3c9))
