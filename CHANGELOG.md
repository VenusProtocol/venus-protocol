## [9.0.0-dev.6](https://github.com/VenusProtocol/venus-protocol/compare/v9.0.0-dev.5...v9.0.0-dev.6) (2024-05-10)


### Features

* add VTreasuryV8 deployment on arbitrum one ([73e7eef](https://github.com/VenusProtocol/venus-protocol/commit/73e7eefef42f8115d216b58c0cdff269dc2e3627))
* updating deployment files ([f3af972](https://github.com/VenusProtocol/venus-protocol/commit/f3af9724b4f58f9ef8c528333f3d8112aa7ad675))

## [9.0.0-dev.5](https://github.com/VenusProtocol/venus-protocol/compare/v9.0.0-dev.4...v9.0.0-dev.5) (2024-05-09)


### Bug Fixes

* remove duplicate scripts ([043b037](https://github.com/VenusProtocol/venus-protocol/commit/043b0378c017a5185018914cd3db4e5f4771adeb))

## [9.0.0-dev.4](https://github.com/VenusProtocol/venus-protocol/compare/v9.0.0-dev.3...v9.0.0-dev.4) (2024-05-08)


### Features

* add deployments for Prime on arbitrumsepolia ([991a124](https://github.com/VenusProtocol/venus-protocol/commit/991a124d069d707d9eb0cda79a7b4587888b453d))
* updating deployment files ([60dc9f1](https://github.com/VenusProtocol/venus-protocol/commit/60dc9f16bb5f6a14a8ae18ba4663a4efda4b25c7))
* updating deployment files ([db0e4cb](https://github.com/VenusProtocol/venus-protocol/commit/db0e4cbbb7e7ea742eb5880a78a7dbc8887faf3d))

## [9.0.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v9.0.0-dev.2...v9.0.0-dev.3) (2024-05-06)


### Bug Fixes

* fix deployment scripts to work with hardhat ([79ed318](https://github.com/VenusProtocol/venus-protocol/commit/79ed3183de8d84dd0a41e589f39fe1dcbc39414a))

## [9.0.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v9.0.0-dev.1...v9.0.0-dev.2) (2024-05-06)


### Features

* support batch repayments of VAI in governance helper ([7087b4d](https://github.com/VenusProtocol/venus-protocol/commit/7087b4d27ef7b39c26df955d3d2bb47cd09ba987))
* updating deployment files ([316075b](https://github.com/VenusProtocol/venus-protocol/commit/316075bc505217d85f90321ad67a8d9fdbe7d5da))

## [9.0.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v8.1.0...v9.0.0-dev.1) (2024-05-04)


### ⚠ BREAKING CHANGES

* revert upon failed mint
* return the actually repaid amount including interest

### Features

* add deployments for VAIController upgrade ([5d93c7e](https://github.com/VenusProtocol/venus-protocol/commit/5d93c7e8e660278521a1aceed15d942a7559189a))
* add repayVAIBehalf ([265fa4c](https://github.com/VenusProtocol/venus-protocol/commit/265fa4c7fbdb885e8146b0e2758990abb978b746))
* deploy audited version of VAIController ([071a1f1](https://github.com/VenusProtocol/venus-protocol/commit/071a1f1e79add330de7ff5d5ee6f4ad2f0cf013e))
* updating deployment files ([ca8c89c](https://github.com/VenusProtocol/venus-protocol/commit/ca8c89c02d3c1519956ee552d28aa18ec4687917))
* updating deployment files ([a5c61de](https://github.com/VenusProtocol/venus-protocol/commit/a5c61de626ce4a42924201bcafc08c2f75ddc9ce))
* updating deployment files ([d184717](https://github.com/VenusProtocol/venus-protocol/commit/d1847172d18cb490b4c23e0f8e583cff682afb8e))


### Bug Fixes

* certik/VAI-02 add zero address check for borrower ([233ffcc](https://github.com/VenusProtocol/venus-protocol/commit/233ffcc60c7eabc6d199546554c9b2e455780593))
* define VAIControllerInterface correctly ([f3af464](https://github.com/VenusProtocol/venus-protocol/commit/f3af464657e1a9cdbc93a8d10aed859f1f74c905))
* return the actually repaid amount including interest ([6b7636b](https://github.com/VenusProtocol/venus-protocol/commit/6b7636bd45184aac804b16e3217764ecb9d1594e))


### Performance Improvements

* cache markets count in getMintableVAI ([f1a45fd](https://github.com/VenusProtocol/venus-protocol/commit/f1a45fd34cd503fe4e3f24551be64e54a2e183cf))


### Code Refactoring

* revert upon failed mint ([f24073a](https://github.com/VenusProtocol/venus-protocol/commit/f24073a789b8f3a02ac3524c7496c5ede943c335))

## [8.1.0](https://github.com/VenusProtocol/venus-protocol/compare/v8.0.0...v8.1.0) (2024-04-26)


### Features

* add deployments for XVSVault on arbitrum sepolia ([bdb1a21](https://github.com/VenusProtocol/venus-protocol/commit/bdb1a219f9c329af11f456edec6443d964840956))
* updating deployment files ([2782c68](https://github.com/VenusProtocol/venus-protocol/commit/2782c68c55d42edb43610be5c1c42d5467e77480))
* updating deployment files ([cbf20db](https://github.com/VenusProtocol/venus-protocol/commit/cbf20dbb8c5968c218d72aee4063e9b2a180740f))

## [8.1.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v8.0.0...v8.1.0-dev.1) (2024-04-26)


### Features

* add deployments for XVSVault on arbitrum sepolia ([bdb1a21](https://github.com/VenusProtocol/venus-protocol/commit/bdb1a219f9c329af11f456edec6443d964840956))
* updating deployment files ([2782c68](https://github.com/VenusProtocol/venus-protocol/commit/2782c68c55d42edb43610be5c1c42d5467e77480))
* updating deployment files ([cbf20db](https://github.com/VenusProtocol/venus-protocol/commit/cbf20dbb8c5968c218d72aee4063e9b2a180740f))

## [8.0.0](https://github.com/VenusProtocol/venus-protocol/compare/v7.5.0...v8.0.0) (2024-04-11)


### ⚠ BREAKING CHANGES

* migrate to Solidity 0.8.25

### Features

* add deployments of IR for bscmainnet ([b91ad15](https://github.com/VenusProtocol/venus-protocol/commit/b91ad1578434e386cd1f5538a03156533f9ec190))
* add redeemAndRepayBatch to the governance helper ([5c7ca53](https://github.com/VenusProtocol/venus-protocol/commit/5c7ca537fa2bfc6fe20cb5147bafaaf76841382d))
* add VTreasuryV8 deployment on arbitrum sepolia ([850d5b9](https://github.com/VenusProtocol/venus-protocol/commit/850d5b96a7159361e5ecf55ec64c0eb34623c3a0))
* migrate to Solidity 0.8.25 ([3bbb396](https://github.com/VenusProtocol/venus-protocol/commit/3bbb396efb30cb0b5a8a4f19d3bfa930ac9b0b20))
* updating deployment files ([ae58d9d](https://github.com/VenusProtocol/venus-protocol/commit/ae58d9df09b3057f5e88a267c3da2a57c559d661))
* updating deployment files ([0874d1e](https://github.com/VenusProtocol/venus-protocol/commit/0874d1ec2bc8e23950d7dffb375c808a3f3c6c3d))
* updating deployment files ([cf5baaf](https://github.com/VenusProtocol/venus-protocol/commit/cf5baaf89ee7319bcb2d4fc07866874d18c8075f))
* updating deployment files ([ec48969](https://github.com/VenusProtocol/venus-protocol/commit/ec48969a6c117e2ea2e2b90b02a96470816659ee))
* updating deployment files ([b65fb19](https://github.com/VenusProtocol/venus-protocol/commit/b65fb196f1e4c8f723c28485265082f201dc5c8f))
* updating deployment files ([e6fcaae](https://github.com/VenusProtocol/venus-protocol/commit/e6fcaaef0b3928f801c4372d2ef229ef8ac8c550))
* updating deployment files ([5a6c3dd](https://github.com/VenusProtocol/venus-protocol/commit/5a6c3ddc30dea5f7bddfbeedc5a70403ad11f454))
* updating deployment files ([c7eed76](https://github.com/VenusProtocol/venus-protocol/commit/c7eed76887b01622bc26c7504f06436489e2c28a))


### Bug Fixes

* added deployments ([913eb66](https://github.com/VenusProtocol/venus-protocol/commit/913eb66d113e86b9c5abe594dc1d0ecd71878eff))
* backward compatibility ([859458c](https://github.com/VenusProtocol/venus-protocol/commit/859458cb96234727f6211fd1cd454345f672de67))
* deployed xvs vault ([f06d9bc](https://github.com/VenusProtocol/venus-protocol/commit/f06d9bcf4ffddfa30d21a795381aee864b48ba74))
* fixed integration tests ([3521609](https://github.com/VenusProtocol/venus-protocol/commit/3521609b019cc9d8b11b8435e1d445a57b992f90))
* fixed lock period ([ef0ebf1](https://github.com/VenusProtocol/venus-protocol/commit/ef0ebf1adc3bf484f482cdd04ea2b2b4185e5aad))
* fixed prime test ([2051fbc](https://github.com/VenusProtocol/venus-protocol/commit/2051fbc53eb45926141964adcace4c630a8c9fb6))
* fixed TimeManagerV5 ([c5aea51](https://github.com/VenusProtocol/venus-protocol/commit/c5aea5157214d3ed5bae2597e77c3bf5ca78f8eb))
* fork test for testing invalid opcode ([2a8ac14](https://github.com/VenusProtocol/venus-protocol/commit/2a8ac141598873fc521b250e779862d0ee55d4e3))
* integrated time manager in xvs vault ([acb5538](https://github.com/VenusProtocol/venus-protocol/commit/acb5538d859af9c4a2165bf450e83def2c5b49a6))
* optimised storage slot ([4d7debd](https://github.com/VenusProtocol/venus-protocol/commit/4d7debdc67141b754217e5286476404eefc5549a))
* redeployed ([d06b583](https://github.com/VenusProtocol/venus-protocol/commit/d06b5839186fcfedf29199becfbda06cb583b625))
* resolved conflict ([46d2838](https://github.com/VenusProtocol/venus-protocol/commit/46d2838ad07d994d2b5a499373bb5a55689c3e8b))
* rpc for arbitrumOne ([8340342](https://github.com/VenusProtocol/venus-protocol/commit/8340342008c1a88e9049acd532c2a434d9ea9736))
* rpc for arbitrumSepolia ([a0453d4](https://github.com/VenusProtocol/venus-protocol/commit/a0453d4cfd5c5ad494656e180be5cb5ea932dba4))
* use funcs from utils ([a2a22b2](https://github.com/VenusProtocol/venus-protocol/commit/a2a22b2993c1ac5deb9d8bade5e3ab2c2744cfed))

## [8.0.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v7.6.0-dev.5...v8.0.0-dev.1) (2024-04-11)


### ⚠ BREAKING CHANGES

* migrate to Solidity 0.8.25

### Features

* migrate to Solidity 0.8.25 ([3bbb396](https://github.com/VenusProtocol/venus-protocol/commit/3bbb396efb30cb0b5a8a4f19d3bfa930ac9b0b20))

## [7.6.0-dev.5](https://github.com/VenusProtocol/venus-protocol/compare/v7.6.0-dev.4...v7.6.0-dev.5) (2024-04-10)

## [7.6.0-dev.4](https://github.com/VenusProtocol/venus-protocol/compare/v7.6.0-dev.3...v7.6.0-dev.4) (2024-04-09)


### Features

* add deployments of IR for bscmainnet ([b91ad15](https://github.com/VenusProtocol/venus-protocol/commit/b91ad1578434e386cd1f5538a03156533f9ec190))
* updating deployment files ([ae58d9d](https://github.com/VenusProtocol/venus-protocol/commit/ae58d9df09b3057f5e88a267c3da2a57c559d661))
* updating deployment files ([cf5baaf](https://github.com/VenusProtocol/venus-protocol/commit/cf5baaf89ee7319bcb2d4fc07866874d18c8075f))

## [7.6.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v7.6.0-dev.2...v7.6.0-dev.3) (2024-04-09)


### Features

* add redeemAndRepayBatch to the governance helper ([5c7ca53](https://github.com/VenusProtocol/venus-protocol/commit/5c7ca537fa2bfc6fe20cb5147bafaaf76841382d))
* updating deployment files ([0874d1e](https://github.com/VenusProtocol/venus-protocol/commit/0874d1ec2bc8e23950d7dffb375c808a3f3c6c3d))

## [7.6.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v7.6.0-dev.1...v7.6.0-dev.2) (2024-03-27)


### Features

* updating deployment files ([e6fcaae](https://github.com/VenusProtocol/venus-protocol/commit/e6fcaaef0b3928f801c4372d2ef229ef8ac8c550))
* updating deployment files ([5a6c3dd](https://github.com/VenusProtocol/venus-protocol/commit/5a6c3ddc30dea5f7bddfbeedc5a70403ad11f454))
* updating deployment files ([c7eed76](https://github.com/VenusProtocol/venus-protocol/commit/c7eed76887b01622bc26c7504f06436489e2c28a))


### Bug Fixes

* added deployments ([913eb66](https://github.com/VenusProtocol/venus-protocol/commit/913eb66d113e86b9c5abe594dc1d0ecd71878eff))
* backward compatibility ([859458c](https://github.com/VenusProtocol/venus-protocol/commit/859458cb96234727f6211fd1cd454345f672de67))
* deployed xvs vault ([f06d9bc](https://github.com/VenusProtocol/venus-protocol/commit/f06d9bcf4ffddfa30d21a795381aee864b48ba74))
* fixed integration tests ([3521609](https://github.com/VenusProtocol/venus-protocol/commit/3521609b019cc9d8b11b8435e1d445a57b992f90))
* fixed lock period ([ef0ebf1](https://github.com/VenusProtocol/venus-protocol/commit/ef0ebf1adc3bf484f482cdd04ea2b2b4185e5aad))
* fixed prime test ([2051fbc](https://github.com/VenusProtocol/venus-protocol/commit/2051fbc53eb45926141964adcace4c630a8c9fb6))
* fixed TimeManagerV5 ([c5aea51](https://github.com/VenusProtocol/venus-protocol/commit/c5aea5157214d3ed5bae2597e77c3bf5ca78f8eb))
* fork test for testing invalid opcode ([2a8ac14](https://github.com/VenusProtocol/venus-protocol/commit/2a8ac141598873fc521b250e779862d0ee55d4e3))
* integrated time manager in xvs vault ([acb5538](https://github.com/VenusProtocol/venus-protocol/commit/acb5538d859af9c4a2165bf450e83def2c5b49a6))
* optimised storage slot ([4d7debd](https://github.com/VenusProtocol/venus-protocol/commit/4d7debdc67141b754217e5286476404eefc5549a))
* redeployed ([d06b583](https://github.com/VenusProtocol/venus-protocol/commit/d06b5839186fcfedf29199becfbda06cb583b625))
* resolved conflict ([46d2838](https://github.com/VenusProtocol/venus-protocol/commit/46d2838ad07d994d2b5a499373bb5a55689c3e8b))
* use funcs from utils ([a2a22b2](https://github.com/VenusProtocol/venus-protocol/commit/a2a22b2993c1ac5deb9d8bade5e3ab2c2744cfed))

## [7.6.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v7.5.0...v7.6.0-dev.1) (2024-03-27)


### Features

* add VTreasuryV8 deployment on arbitrum sepolia ([850d5b9](https://github.com/VenusProtocol/venus-protocol/commit/850d5b96a7159361e5ecf55ec64c0eb34623c3a0))
* updating deployment files ([ec48969](https://github.com/VenusProtocol/venus-protocol/commit/ec48969a6c117e2ea2e2b90b02a96470816659ee))
* updating deployment files ([b65fb19](https://github.com/VenusProtocol/venus-protocol/commit/b65fb196f1e4c8f723c28485265082f201dc5c8f))


### Bug Fixes

* rpc for arbitrumOne ([8340342](https://github.com/VenusProtocol/venus-protocol/commit/8340342008c1a88e9049acd532c2a434d9ea9736))
* rpc for arbitrumSepolia ([a0453d4](https://github.com/VenusProtocol/venus-protocol/commit/a0453d4cfd5c5ad494656e180be5cb5ea932dba4))

## [7.5.0](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.0...v7.5.0) (2024-03-22)


### Features

* updating deployment files ([c0452be](https://github.com/VenusProtocol/venus-protocol/commit/c0452be7d8741cfd7dc72aa231e8038f8436a321))
* updating deployment files ([9b5f32b](https://github.com/VenusProtocol/venus-protocol/commit/9b5f32bf206888dfc882b906eb41ffa4f8d9b0cf))
* updating deployment files ([803ebcc](https://github.com/VenusProtocol/venus-protocol/commit/803ebccef68735f3d963c857f7c09fc473e6f216))
* updating deployment files ([6ac9c36](https://github.com/VenusProtocol/venus-protocol/commit/6ac9c36d0a836a202776224f24974052fc8b6542))
* updating deployment files ([0b17722](https://github.com/VenusProtocol/venus-protocol/commit/0b177221c89ce351c154ef4f2577d03453458682))


### Bug Fixes

* add back vBNB contract ([cedddc9](https://github.com/VenusProtocol/venus-protocol/commit/cedddc98c5ddc9d09aef8032c12a39c19aa47e27))
* deploy vTreasuryV8 on hardaht ([be43f46](https://github.com/VenusProtocol/venus-protocol/commit/be43f464a844967e6255fc7138ace538c5db43c8))
* deployed prime ([5143c48](https://github.com/VenusProtocol/venus-protocol/commit/5143c488d99de7d72e8b27ea1bc723f1004c8df6))
* deployed prime on sepolia ([c482e5d](https://github.com/VenusProtocol/venus-protocol/commit/c482e5db121eb47a3a75386a7b2e333ca117972d))
* fetch normaltimelock from deployments ([5d2a91c](https://github.com/VenusProtocol/venus-protocol/commit/5d2a91c7d8ec1e00de78882502d4f9ca11292ca7))
* fix running deployment scripts on hardhat ([4661a2a](https://github.com/VenusProtocol/venus-protocol/commit/4661a2afa1b8125d0ff0ef9c45487ca76af5b09c))
* fixed lint ([66e2091](https://github.com/VenusProtocol/venus-protocol/commit/66e2091f20318206d5917c1d407d237346dfbb69))
* fixed prime deploy script for ethereum ([706a40c](https://github.com/VenusProtocol/venus-protocol/commit/706a40cc3c41652d6bcca047b6c38306bbe0f8e3))
* importm issing FDUSD implementation ([9b14ec4](https://github.com/VenusProtocol/venus-protocol/commit/9b14ec42b6efbc1336738f85a94b335ad330c4f4))
* lint fix ([8e35574](https://github.com/VenusProtocol/venus-protocol/commit/8e35574c50dcc0b5b5bdc38039e191130c2ec630))
* only run psm on bnb chain ([2a1cac5](https://github.com/VenusProtocol/venus-protocol/commit/2a1cac552ffd62a92438fdf48ea340b08c7a1ee3))
* plp deployed on ethereum ([e234f65](https://github.com/VenusProtocol/venus-protocol/commit/e234f65c3903bfaf07d6efd645a980c11a31d567))
* redeployed prime on sepolia ([4877f7f](https://github.com/VenusProtocol/venus-protocol/commit/4877f7f1b5c6789bfdfdacfd4fb39b8e39110780))
* remove unused isolated pools dep ([dde0504](https://github.com/VenusProtocol/venus-protocol/commit/dde05042fb140cc1ab0deb7c8e392f60e2d47d8c))
* removed log ([eabcb43](https://github.com/VenusProtocol/venus-protocol/commit/eabcb43f10b53d1509ca38db493dd98ad2dec522))
* resolved conflict ([4b284f2](https://github.com/VenusProtocol/venus-protocol/commit/4b284f2142f6e0751796731ba2ee3409ba2b4541))
* updated token-bridge package version ([4936821](https://github.com/VenusProtocol/venus-protocol/commit/49368219a6ec6a5632e2cef7b8f1620e88890fb9))

## [7.5.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v7.5.0-dev.1...v7.5.0-dev.2) (2024-03-22)


### Features

* updating deployment files ([c0452be](https://github.com/VenusProtocol/venus-protocol/commit/c0452be7d8741cfd7dc72aa231e8038f8436a321))
* updating deployment files ([9b5f32b](https://github.com/VenusProtocol/venus-protocol/commit/9b5f32bf206888dfc882b906eb41ffa4f8d9b0cf))
* updating deployment files ([6ac9c36](https://github.com/VenusProtocol/venus-protocol/commit/6ac9c36d0a836a202776224f24974052fc8b6542))
* updating deployment files ([0b17722](https://github.com/VenusProtocol/venus-protocol/commit/0b177221c89ce351c154ef4f2577d03453458682))


### Bug Fixes

* deployed prime ([5143c48](https://github.com/VenusProtocol/venus-protocol/commit/5143c488d99de7d72e8b27ea1bc723f1004c8df6))
* deployed prime on sepolia ([c482e5d](https://github.com/VenusProtocol/venus-protocol/commit/c482e5db121eb47a3a75386a7b2e333ca117972d))
* fixed lint ([66e2091](https://github.com/VenusProtocol/venus-protocol/commit/66e2091f20318206d5917c1d407d237346dfbb69))
* fixed prime deploy script for ethereum ([706a40c](https://github.com/VenusProtocol/venus-protocol/commit/706a40cc3c41652d6bcca047b6c38306bbe0f8e3))
* lint fix ([8e35574](https://github.com/VenusProtocol/venus-protocol/commit/8e35574c50dcc0b5b5bdc38039e191130c2ec630))
* plp deployed on ethereum ([e234f65](https://github.com/VenusProtocol/venus-protocol/commit/e234f65c3903bfaf07d6efd645a980c11a31d567))
* redeployed prime on sepolia ([4877f7f](https://github.com/VenusProtocol/venus-protocol/commit/4877f7f1b5c6789bfdfdacfd4fb39b8e39110780))
* removed log ([eabcb43](https://github.com/VenusProtocol/venus-protocol/commit/eabcb43f10b53d1509ca38db493dd98ad2dec522))
* resolved conflict ([4b284f2](https://github.com/VenusProtocol/venus-protocol/commit/4b284f2142f6e0751796731ba2ee3409ba2b4541))
* updated token-bridge package version ([4936821](https://github.com/VenusProtocol/venus-protocol/commit/49368219a6ec6a5632e2cef7b8f1620e88890fb9))

## [7.5.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.1-dev.1...v7.5.0-dev.1) (2024-03-21)


### Features

* updating deployment files ([803ebcc](https://github.com/VenusProtocol/venus-protocol/commit/803ebccef68735f3d963c857f7c09fc473e6f216))


### Bug Fixes

* add back vBNB contract ([cedddc9](https://github.com/VenusProtocol/venus-protocol/commit/cedddc98c5ddc9d09aef8032c12a39c19aa47e27))
* deploy vTreasuryV8 on hardaht ([be43f46](https://github.com/VenusProtocol/venus-protocol/commit/be43f464a844967e6255fc7138ace538c5db43c8))
* fetch normaltimelock from deployments ([5d2a91c](https://github.com/VenusProtocol/venus-protocol/commit/5d2a91c7d8ec1e00de78882502d4f9ca11292ca7))
* fix running deployment scripts on hardhat ([4661a2a](https://github.com/VenusProtocol/venus-protocol/commit/4661a2afa1b8125d0ff0ef9c45487ca76af5b09c))
* importm issing FDUSD implementation ([9b14ec4](https://github.com/VenusProtocol/venus-protocol/commit/9b14ec42b6efbc1336738f85a94b335ad330c4f4))
* only run psm on bnb chain ([2a1cac5](https://github.com/VenusProtocol/venus-protocol/commit/2a1cac552ffd62a92438fdf48ea340b08c7a1ee3))

## [7.4.1-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.0...v7.4.1-dev.1) (2024-03-20)


### Bug Fixes

* remove unused isolated pools dep ([dde0504](https://github.com/VenusProtocol/venus-protocol/commit/dde05042fb140cc1ab0deb7c8e392f60e2d47d8c))

## [7.4.0](https://github.com/VenusProtocol/venus-protocol/compare/v7.3.0...v7.4.0) (2024-03-19)


### Features

* add actions paused bitmask to VenusLens ([d0f8edf](https://github.com/VenusProtocol/venus-protocol/commit/d0f8edfa182043c8851e21805fa03ad7edf44c2b))
* add deployment files for bscmainnet ([ea6e6de](https://github.com/VenusProtocol/venus-protocol/commit/ea6e6deac8a6b1b3e8dac063da49672238e3a7ed))
* add deployment files for comptroller market facet and VBep20Delegate for bsctestnet ([368ccbd](https://github.com/VenusProtocol/venus-protocol/commit/368ccbdfba6618384845b5036493a40f890c36c1))
* add functionality for seizing of xvs tokens ([f0e09b0](https://github.com/VenusProtocol/venus-protocol/commit/f0e09b0382ad06de49e27cd93377b5885862e76d))
* add functionality of redeem and borrow behalf in tokenRedeemer ([7fbded6](https://github.com/VenusProtocol/venus-protocol/commit/7fbded6e8a6ffadae116cb5e5366727132f1e21f))
* add mising nat spec for public and external functions ([9630cf6](https://github.com/VenusProtocol/venus-protocol/commit/9630cf64b35441adb5a05cba7ce4fe7cb8c4a61d))
* add redeemBehalf and redeemUnderlyingBehalf functionality ([e44d832](https://github.com/VenusProtocol/venus-protocol/commit/e44d832deb2e6aea87e977d761ef0a648fe7aebb))
* deployments and script for tokenRedeemer ([b1b21e2](https://github.com/VenusProtocol/venus-protocol/commit/b1b21e290c2dd4d4fd5e4b06595a1d70a99e8798))
* update deployment file for market facet for bsctestnet ([209d539](https://github.com/VenusProtocol/venus-protocol/commit/209d539569e61be34852162cf37f41a10b24980b))
* update deployment files for bscmainnet ([71b6a79](https://github.com/VenusProtocol/venus-protocol/commit/71b6a7997d513f489b525ae7b19a4d66f3ce6991))
* update deployment files for bsctestnet ([54a1ea9](https://github.com/VenusProtocol/venus-protocol/commit/54a1ea99dd95cd2fb4c03e8ed69d079e4822bd4a))
* update deployments for bsctestnet ([e7218e4](https://github.com/VenusProtocol/venus-protocol/commit/e7218e45403d32faf8cb7cc457c2858231803f1b))
* updating deployment files ([d313970](https://github.com/VenusProtocol/venus-protocol/commit/d31397027faa99e4e7eab2f36a14b5beedb40c57))
* updating deployment files ([74f54eb](https://github.com/VenusProtocol/venus-protocol/commit/74f54ebb09db262fb33f8bc01a4b0342f804efb9))
* updating deployment files ([09fbbb4](https://github.com/VenusProtocol/venus-protocol/commit/09fbbb44b9d216b586e6fc2ed02c8650bab247e2))
* updating deployment files ([ccdcbc1](https://github.com/VenusProtocol/venus-protocol/commit/ccdcbc1dfefd745f67d35b4dd651a655277ccf05))
* updating deployment files ([17076eb](https://github.com/VenusProtocol/venus-protocol/commit/17076eb32fc94b251dcf5c330c9bafe6f6b5bc6c))
* updating deployment files ([d68da7d](https://github.com/VenusProtocol/venus-protocol/commit/d68da7d98b7cfa832012dd215027c5ff3b182e38))
* updating deployment files ([b31e774](https://github.com/VenusProtocol/venus-protocol/commit/b31e774919eeb861ae5e473c55f614a32cbbf0e4))
* updating deployment files ([636d9f2](https://github.com/VenusProtocol/venus-protocol/commit/636d9f239b69812ecfa92806f92019baff987f99))
* updating deployment files ([980c304](https://github.com/VenusProtocol/venus-protocol/commit/980c3040594dd6daee075c89f4941a19042655c1))
* updating deployment files ([a76b85f](https://github.com/VenusProtocol/venus-protocol/commit/a76b85fbdc3cd00aa6c515fcf351040197010233))
* updating deployment files ([8361fcd](https://github.com/VenusProtocol/venus-protocol/commit/8361fcd41330d1386a09d2ad45b3ce5e143f62ed))
* updating deployment files ([7e5b264](https://github.com/VenusProtocol/venus-protocol/commit/7e5b264606a69db776390fa9f04bc274390367c4))
* updating deployment files ([b344f3d](https://github.com/VenusProtocol/venus-protocol/commit/b344f3db895302c499cabba33dcd9541548d06b5))
* ven-2250 reduce reserves with available cash ([53e37eb](https://github.com/VenusProtocol/venus-protocol/commit/53e37eb614ad9e23a74f1d159f28c5e311175561))
* venuslens redeployment to bscmainnet ([e9a4f80](https://github.com/VenusProtocol/venus-protocol/commit/e9a4f80e5a56f6d724edc81109bd24a1a32f6f50))
* venuslens redployment to bsctestnet ([4918ee1](https://github.com/VenusProtocol/venus-protocol/commit/4918ee1239b8930e3b3bc0ad21a3a8e14a0336a6))


### Bug Fixes

* added fork tests ([32d6dcc](https://github.com/VenusProtocol/venus-protocol/commit/32d6dcceeb33be1e1e8becb865e33e9178ad0d85))
* added index to events ([155cb07](https://github.com/VenusProtocol/venus-protocol/commit/155cb078f8152c1149be2ec7e81f643ba2a4b493))
* create enum for diamond actions ([150579c](https://github.com/VenusProtocol/venus-protocol/commit/150579cc17ccedfa95ea5d8071b0a34012fdc1dc))
* fixed case ([0690273](https://github.com/VenusProtocol/venus-protocol/commit/0690273f77c2793051b281f3ad590e232fcdb870))
* fixed test ([96574ea](https://github.com/VenusProtocol/venus-protocol/commit/96574ea27041ce9b3935ec03f7b8fce540475ec4))
* fixed XVS address ([48ea441](https://github.com/VenusProtocol/venus-protocol/commit/48ea44104a87cf7473aa067d32e91d1bcc475454))
* interface functions for backward compatibility ([8c3378a](https://github.com/VenusProtocol/venus-protocol/commit/8c3378a4011298226b3a9c36e2679df2b7fb61fc))
* L01 ([156fe5e](https://github.com/VenusProtocol/venus-protocol/commit/156fe5e0a38eed1678d491348b511406436cf698))
* rebased ([ccddfde](https://github.com/VenusProtocol/venus-protocol/commit/ccddfde3d08c9690c2c96ddba9d35ee97200c1d0))
* resolved conflict ([6977ee3](https://github.com/VenusProtocol/venus-protocol/commit/6977ee3a3b459674bf53383e2d4bc303b3c9407d))
* revert condition for transferring of XVS in seizeVenus and add events ([a63c9c9](https://github.com/VenusProtocol/venus-protocol/commit/a63c9c9a72474a5f8aa1f4f79b1bc13514e830cf))
* RFD-01 logic can be skipped if holder has zero venus accrued ([f0996f1](https://github.com/VenusProtocol/venus-protocol/commit/f0996f1e1f2c016e587ba14eb425f563543ebf00))
* RFD-02 unnecessary variable update ([0c7e1f8](https://github.com/VenusProtocol/venus-protocol/commit/0c7e1f8ea0e3453c530dbcafa5be5849d62748ba))
* RFD-04 missing or incomplete natspec ([7d2d183](https://github.com/VenusProtocol/venus-protocol/commit/7d2d183ab08543f4f06c33cb068232a58db35f02))
* set xvs and xvsVToken address ([ebee280](https://github.com/VenusProtocol/venus-protocol/commit/ebee28072f88ffe77c52dc53dcc83cb97790ed61))
* VEN-GATE-5 ([0d48640](https://github.com/VenusProtocol/venus-protocol/commit/0d4864063f2cf629220d58739e8b81a53a733731))
* VPB-01 ([e81ab4f](https://github.com/VenusProtocol/venus-protocol/commit/e81ab4feaa5a2e62c27a5532251931b3ce749741))
* VPB-01 ([9bad33f](https://github.com/VenusProtocol/venus-protocol/commit/9bad33fbda0631a7b85e14d1eae0aae8e545842d))
* VPH-01 typos and inconsistencies ([78db5f8](https://github.com/VenusProtocol/venus-protocol/commit/78db5f88ba0e9a4c09286bbdea8687ac958e9813))
* VPH-01 typos and inconsistencies ([5032671](https://github.com/VenusProtocol/venus-protocol/commit/5032671039ea5ec95fc6dd63dbcec4d50b4212d3))
* VTIME-3 ([6ff148d](https://github.com/VenusProtocol/venus-protocol/commit/6ff148d8aa3a2d7adcce7ced0967bac8b5f1f9f8))
* VTT-01 missing return statement setReduceReservesBlockDelta() and setProtocolShareReserve() ([9cfeba7](https://github.com/VenusProtocol/venus-protocol/commit/9cfeba718e68aa7294c9895c51037f9e9b81e450))

## [7.4.0-dev.8](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.0-dev.7...v7.4.0-dev.8) (2024-03-19)


### Features

* add deployment files for bscmainnet ([ea6e6de](https://github.com/VenusProtocol/venus-protocol/commit/ea6e6deac8a6b1b3e8dac063da49672238e3a7ed))
* add deployment files for comptroller market facet and VBep20Delegate for bsctestnet ([368ccbd](https://github.com/VenusProtocol/venus-protocol/commit/368ccbdfba6618384845b5036493a40f890c36c1))
* add redeemBehalf and redeemUnderlyingBehalf functionality ([e44d832](https://github.com/VenusProtocol/venus-protocol/commit/e44d832deb2e6aea87e977d761ef0a648fe7aebb))
* update deployment file for market facet for bsctestnet ([209d539](https://github.com/VenusProtocol/venus-protocol/commit/209d539569e61be34852162cf37f41a10b24980b))
* update deployment files for bscmainnet ([71b6a79](https://github.com/VenusProtocol/venus-protocol/commit/71b6a7997d513f489b525ae7b19a4d66f3ce6991))
* update deployment files for bsctestnet ([54a1ea9](https://github.com/VenusProtocol/venus-protocol/commit/54a1ea99dd95cd2fb4c03e8ed69d079e4822bd4a))
* update deployments for bsctestnet ([e7218e4](https://github.com/VenusProtocol/venus-protocol/commit/e7218e45403d32faf8cb7cc457c2858231803f1b))
* updating deployment files ([d313970](https://github.com/VenusProtocol/venus-protocol/commit/d31397027faa99e4e7eab2f36a14b5beedb40c57))
* updating deployment files ([74f54eb](https://github.com/VenusProtocol/venus-protocol/commit/74f54ebb09db262fb33f8bc01a4b0342f804efb9))
* updating deployment files ([09fbbb4](https://github.com/VenusProtocol/venus-protocol/commit/09fbbb44b9d216b586e6fc2ed02c8650bab247e2))
* updating deployment files ([d68da7d](https://github.com/VenusProtocol/venus-protocol/commit/d68da7d98b7cfa832012dd215027c5ff3b182e38))
* updating deployment files ([b31e774](https://github.com/VenusProtocol/venus-protocol/commit/b31e774919eeb861ae5e473c55f614a32cbbf0e4))
* updating deployment files ([8361fcd](https://github.com/VenusProtocol/venus-protocol/commit/8361fcd41330d1386a09d2ad45b3ce5e143f62ed))
* updating deployment files ([7e5b264](https://github.com/VenusProtocol/venus-protocol/commit/7e5b264606a69db776390fa9f04bc274390367c4))


### Bug Fixes

* L01 ([156fe5e](https://github.com/VenusProtocol/venus-protocol/commit/156fe5e0a38eed1678d491348b511406436cf698))
* VEN-GATE-5 ([0d48640](https://github.com/VenusProtocol/venus-protocol/commit/0d4864063f2cf629220d58739e8b81a53a733731))
* VPB-01 ([e81ab4f](https://github.com/VenusProtocol/venus-protocol/commit/e81ab4feaa5a2e62c27a5532251931b3ce749741))
* VPB-01 ([9bad33f](https://github.com/VenusProtocol/venus-protocol/commit/9bad33fbda0631a7b85e14d1eae0aae8e545842d))
* VTIME-3 ([6ff148d](https://github.com/VenusProtocol/venus-protocol/commit/6ff148d8aa3a2d7adcce7ced0967bac8b5f1f9f8))

## [7.4.0-dev.7](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.0-dev.6...v7.4.0-dev.7) (2024-03-13)


### Features

* add actions paused bitmask to VenusLens ([d0f8edf](https://github.com/VenusProtocol/venus-protocol/commit/d0f8edfa182043c8851e21805fa03ad7edf44c2b))
* updating deployment files ([ccdcbc1](https://github.com/VenusProtocol/venus-protocol/commit/ccdcbc1dfefd745f67d35b4dd651a655277ccf05))
* updating deployment files ([17076eb](https://github.com/VenusProtocol/venus-protocol/commit/17076eb32fc94b251dcf5c330c9bafe6f6b5bc6c))
* updating deployment files ([636d9f2](https://github.com/VenusProtocol/venus-protocol/commit/636d9f239b69812ecfa92806f92019baff987f99))
* venuslens redeployment to bscmainnet ([e9a4f80](https://github.com/VenusProtocol/venus-protocol/commit/e9a4f80e5a56f6d724edc81109bd24a1a32f6f50))
* venuslens redployment to bsctestnet ([4918ee1](https://github.com/VenusProtocol/venus-protocol/commit/4918ee1239b8930e3b3bc0ad21a3a8e14a0336a6))

## [7.4.0-dev.6](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.0-dev.5...v7.4.0-dev.6) (2024-03-07)


### Features

* add functionality of redeem and borrow behalf in tokenRedeemer ([7fbded6](https://github.com/VenusProtocol/venus-protocol/commit/7fbded6e8a6ffadae116cb5e5366727132f1e21f))
* deployments and script for tokenRedeemer ([b1b21e2](https://github.com/VenusProtocol/venus-protocol/commit/b1b21e290c2dd4d4fd5e4b06595a1d70a99e8798))
* updating deployment files ([a76b85f](https://github.com/VenusProtocol/venus-protocol/commit/a76b85fbdc3cd00aa6c515fcf351040197010233))

## [7.4.0-dev.5](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.0-dev.4...v7.4.0-dev.5) (2024-03-06)


### Features

* ven-2250 reduce reserves with available cash ([53e37eb](https://github.com/VenusProtocol/venus-protocol/commit/53e37eb614ad9e23a74f1d159f28c5e311175561))


### Bug Fixes

* VTT-01 missing return statement setReduceReservesBlockDelta() and setProtocolShareReserve() ([9cfeba7](https://github.com/VenusProtocol/venus-protocol/commit/9cfeba718e68aa7294c9895c51037f9e9b81e450))

## [7.4.0-dev.4](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.0-dev.3...v7.4.0-dev.4) (2024-03-06)


### Features

* updating deployment files ([b344f3d](https://github.com/VenusProtocol/venus-protocol/commit/b344f3db895302c499cabba33dcd9541548d06b5))


### Bug Fixes

* added fork tests ([32d6dcc](https://github.com/VenusProtocol/venus-protocol/commit/32d6dcceeb33be1e1e8becb865e33e9178ad0d85))
* added index to events ([155cb07](https://github.com/VenusProtocol/venus-protocol/commit/155cb078f8152c1149be2ec7e81f643ba2a4b493))
* create enum for diamond actions ([150579c](https://github.com/VenusProtocol/venus-protocol/commit/150579cc17ccedfa95ea5d8071b0a34012fdc1dc))
* fixed case ([0690273](https://github.com/VenusProtocol/venus-protocol/commit/0690273f77c2793051b281f3ad590e232fcdb870))
* fixed test ([96574ea](https://github.com/VenusProtocol/venus-protocol/commit/96574ea27041ce9b3935ec03f7b8fce540475ec4))
* fixed XVS address ([48ea441](https://github.com/VenusProtocol/venus-protocol/commit/48ea44104a87cf7473aa067d32e91d1bcc475454))
* interface functions for backward compatibility ([8c3378a](https://github.com/VenusProtocol/venus-protocol/commit/8c3378a4011298226b3a9c36e2679df2b7fb61fc))
* rebased ([ccddfde](https://github.com/VenusProtocol/venus-protocol/commit/ccddfde3d08c9690c2c96ddba9d35ee97200c1d0))
* resolved conflict ([6977ee3](https://github.com/VenusProtocol/venus-protocol/commit/6977ee3a3b459674bf53383e2d4bc303b3c9407d))
* set xvs and xvsVToken address ([ebee280](https://github.com/VenusProtocol/venus-protocol/commit/ebee28072f88ffe77c52dc53dcc83cb97790ed61))
* VPH-01 typos and inconsistencies ([78db5f8](https://github.com/VenusProtocol/venus-protocol/commit/78db5f88ba0e9a4c09286bbdea8687ac958e9813))

## [7.4.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.0-dev.2...v7.4.0-dev.3) (2024-03-06)


### Features

* add functionality for seizing of xvs tokens ([f0e09b0](https://github.com/VenusProtocol/venus-protocol/commit/f0e09b0382ad06de49e27cd93377b5885862e76d))


### Bug Fixes

* revert condition for transferring of XVS in seizeVenus and add events ([a63c9c9](https://github.com/VenusProtocol/venus-protocol/commit/a63c9c9a72474a5f8aa1f4f79b1bc13514e830cf))
* RFD-01 logic can be skipped if holder has zero venus accrued ([f0996f1](https://github.com/VenusProtocol/venus-protocol/commit/f0996f1e1f2c016e587ba14eb425f563543ebf00))
* RFD-02 unnecessary variable update ([0c7e1f8](https://github.com/VenusProtocol/venus-protocol/commit/0c7e1f8ea0e3453c530dbcafa5be5849d62748ba))
* RFD-04 missing or incomplete natspec ([7d2d183](https://github.com/VenusProtocol/venus-protocol/commit/7d2d183ab08543f4f06c33cb068232a58db35f02))
* VPH-01 typos and inconsistencies ([5032671](https://github.com/VenusProtocol/venus-protocol/commit/5032671039ea5ec95fc6dd63dbcec4d50b4212d3))

## [7.4.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v7.4.0-dev.1...v7.4.0-dev.2) (2024-03-02)


### Features

* updating deployment files ([980c304](https://github.com/VenusProtocol/venus-protocol/commit/980c3040594dd6daee075c89f4941a19042655c1))

## [7.4.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v7.3.0...v7.4.0-dev.1) (2024-02-23)


### Features

* add mising nat spec for public and external functions ([9630cf6](https://github.com/VenusProtocol/venus-protocol/commit/9630cf64b35441adb5a05cba7ce4fe7cb8c4a61d))

## [7.3.0](https://github.com/VenusProtocol/venus-protocol/compare/v7.2.0...v7.3.0) (2024-02-16)


### Features

* add ACM v8 to liquidator ([09a83b4](https://github.com/VenusProtocol/venus-protocol/commit/09a83b4a15273f6ff127c765b683d14f6b835322))
* add ACM v8 to liquidator ([8dbd1fa](https://github.com/VenusProtocol/venus-protocol/commit/8dbd1fa934f1aac36b2fea9cf6dae3d2764ee5df))
* add deployment script and upgrade bscmainnet liquidator implementation ([6cfb1ee](https://github.com/VenusProtocol/venus-protocol/commit/6cfb1ee3623ddf4188b389852ec361ea5fddce34))
* add deployments of liquidator ([da76f4a](https://github.com/VenusProtocol/venus-protocol/commit/da76f4a13a6901378d31ebd00bf0e1868980e924))
* add VAI liquidaton check ([a0c45c7](https://github.com/VenusProtocol/venus-protocol/commit/a0c45c73c83ea8bfd2faa41ddab36354ed63a92d))
* check force liquidation enabled ([40433a0](https://github.com/VenusProtocol/venus-protocol/commit/40433a0d8d922c363ec022be217bcc78782f090b))
* consider BNB collateral to reduce reserves ([b8dfe6a](https://github.com/VenusProtocol/venus-protocol/commit/b8dfe6a23bbe6c694b0b8306f9459249390c3b4a))
* deployments of XVSVault on opbnbmainnet ([17bae92](https://github.com/VenusProtocol/venus-protocol/commit/17bae92107b61a6638ff60ed4df177c965f6da93))
* updating deployment files ([1b77d8d](https://github.com/VenusProtocol/venus-protocol/commit/1b77d8d52359191b81efe86b52527b55d017ded0))
* updating deployment files ([c1fad3e](https://github.com/VenusProtocol/venus-protocol/commit/c1fad3e72a5e3f84834789a1b420af7a6504c314))
* updating deployment files ([1c9060b](https://github.com/VenusProtocol/venus-protocol/commit/1c9060b3b49357778bdeec676a52d18dad4666f5))
* updating deployment files ([2a2fe93](https://github.com/VenusProtocol/venus-protocol/commit/2a2fe9337e3c4a45e83313e8d2bc37a3085042bb))
* updating deployment files ([2f6106f](https://github.com/VenusProtocol/venus-protocol/commit/2f6106f8c8f429ebaa5c44a2eb74522deb58ea1b))
* updating deployment files ([20325a8](https://github.com/VenusProtocol/venus-protocol/commit/20325a8e2b9aa8b6578d12740a03bd66be753454))
* updating deployment files ([1de1c22](https://github.com/VenusProtocol/venus-protocol/commit/1de1c22e8b3d05b96c339362074494bbb907c2c5))
* VEN-1148 liquidation redeem and reduce reserves ([b2267aa](https://github.com/VenusProtocol/venus-protocol/commit/b2267aacdd60e9b5e6f8823baaed64c7029e9846))
* VEN-1308 add force VAI liquidation ([1101406](https://github.com/VenusProtocol/venus-protocol/commit/1101406763b89aa071a197beb2de09524024109c))
* VEN-1308 add force VAI liquidation ([491df3f](https://github.com/VenusProtocol/venus-protocol/commit/491df3ffd91fc44580f5c3d970228bf2d6b1a675))


### Bug Fixes

* add length checks and remove treasury contract address ([6000ae3](https://github.com/VenusProtocol/venus-protocol/commit/6000ae3cac9ac5353d5ba918caa7919f5225d42b))
* check redeem action ([3c9a57e](https://github.com/VenusProtocol/venus-protocol/commit/3c9a57edb607c178bc047d9538768208452ac2a8))
* checks and add netspac ([e95cf6c](https://github.com/VenusProtocol/venus-protocol/commit/e95cf6cef6631c2600ad98324c53b37f4ae37987))
* compile issue ([d26c448](https://github.com/VenusProtocol/venus-protocol/commit/d26c448ec9567ddacc608d2af422ba0838d4e962))
* comptroller lens address on bsctestnet ([589cfb4](https://github.com/VenusProtocol/venus-protocol/commit/589cfb42d3bb4a37a5de576c89cdf8063a7c8a47))
* fix test for liquidator ([da5b6eb](https://github.com/VenusProtocol/venus-protocol/commit/da5b6eb986fda1631a13b5df092a746598edeca0))
* fix test for liquidator ([598dd45](https://github.com/VenusProtocol/venus-protocol/commit/598dd45396f4bf14ae13ad86a037cc4648859944))
* lint ([4345032](https://github.com/VenusProtocol/venus-protocol/commit/434503240172da535ab2245c51cd3d7fccfbe330))
* liquidator tests ([8016d5f](https://github.com/VenusProtocol/venus-protocol/commit/8016d5fe5604f62ab67c6f87234e2f92279785d3))
* LLV-01 ([6d33c87](https://github.com/VenusProtocol/venus-protocol/commit/6d33c87e5cdd4ee2b97b2fd4f913af731650cf63))
* LLV-02 ([ead5354](https://github.com/VenusProtocol/venus-protocol/commit/ead535434acc71f932158bce3c4408f89539389f))
* LLV-03 ([c831054](https://github.com/VenusProtocol/venus-protocol/commit/c831054531b10ca1c7cd54f2f4549e9d4c84264f))
* LLV-06 ([925c44d](https://github.com/VenusProtocol/venus-protocol/commit/925c44d6840d68e2388483e1e3b3eeb57baf37bd))
* LLV-07 ([9555b7e](https://github.com/VenusProtocol/venus-protocol/commit/9555b7ef5937432c7893e93753ee70d693bf1d75))
* LLV-08 ([49f76b2](https://github.com/VenusProtocol/venus-protocol/commit/49f76b28f618f3d110708981b63595843171c87d))
* LLV-09 ([90bcafe](https://github.com/VenusProtocol/venus-protocol/commit/90bcafe9ce81135b62ae08d984ea4e00b22cc464))
* LLV-10 ([f79a308](https://github.com/VenusProtocol/venus-protocol/commit/f79a308b2c9ba7d0b684bbf8f90748e665b6f4f0))
* merge conflicts ([b09b2e2](https://github.com/VenusProtocol/venus-protocol/commit/b09b2e2e827ebc1aa9b7691f82829eb62a4a130f))
* minor ([ac1f746](https://github.com/VenusProtocol/venus-protocol/commit/ac1f7468788da6309b73c5a8a54f9137360b5317))
* minor fix ([8766208](https://github.com/VenusProtocol/venus-protocol/commit/87662084a19809ffd709427c47c9a8089e3ba5aa))
* minor fix ([d53178c](https://github.com/VenusProtocol/venus-protocol/commit/d53178c384f403b1a0b7f1b2a4c911a25bed0b14))
* N-01 Incorrect Docstring ([e4832bd](https://github.com/VenusProtocol/venus-protocol/commit/e4832bde9c8bf1fb701980ec929fef4175d52a4b))
* N-02 Improper Use of Named Return Variable ([a1ebea6](https://github.com/VenusProtocol/venus-protocol/commit/a1ebea63e65375137c4e829d9ec5960361d43dbc))
* N-03 Using int/uint Instead of int256/uint256 ([460db5a](https://github.com/VenusProtocol/venus-protocol/commit/460db5a97b575b4635b32b4317c358b5d9a29bf4))
* PVE-003 ([92ff328](https://github.com/VenusProtocol/venus-protocol/commit/92ff32882d42f8b6de01abdcd36de81286cd1443))
* remove outdated Comptroller deployment, fix deployment script and redeploy vFDUSD ([c4c6b3a](https://github.com/VenusProtocol/venus-protocol/commit/c4c6b3ad3f153700b9c95c547024b547dbc6f179))
* resolve comments ([1d02ee1](https://github.com/VenusProtocol/venus-protocol/commit/1d02ee194c8c2c551ad65cd37d1db3fb1fc71197))
* resolve comments ([597a2ec](https://github.com/VenusProtocol/venus-protocol/commit/597a2ec13591bbbb92f06343fee721180e90db2c))
* resolve comments ([e33e0da](https://github.com/VenusProtocol/venus-protocol/commit/e33e0daff22decc9610e68ba30b12c970034ddf8))
* resolve comments ([a2e0d7e](https://github.com/VenusProtocol/venus-protocol/commit/a2e0d7ef35b53f73b869864ec37016e9955adc0e))
* tests ([8b00dff](https://github.com/VenusProtocol/venus-protocol/commit/8b00dff0af58611672fa63807b23d2fad1931fdd))
* tests ([2aead88](https://github.com/VenusProtocol/venus-protocol/commit/2aead88ced6d332c77a9744d79e7716b521fee85))
* typo ([61e8671](https://github.com/VenusProtocol/venus-protocol/commit/61e867134778c4fc34838e470075b557f36f23ce))
* ven-1658 ([6651191](https://github.com/VenusProtocol/venus-protocol/commit/665119148c76291f8a72d778b2e4140c7c80456c))
* VEN-3 ([5f39ba0](https://github.com/VenusProtocol/venus-protocol/commit/5f39ba0ee58a3c430075044c0f1ca919bb5759d5))
* VEN-8 ([f991967](https://github.com/VenusProtocol/venus-protocol/commit/f99196754ceea6e28ac69be3ad55cdce8d261339))
* VENUS-LIQUIDATOR-003 ([c42f1e2](https://github.com/VenusProtocol/venus-protocol/commit/c42f1e2b9ee92aaff708ebdb2f8a51a8a51b7127))
* VENUS-LIQUIDATOR-005 ([f64c645](https://github.com/VenusProtocol/venus-protocol/commit/f64c6459422a0f8e0ceb3afbdb3f4c63f793b354))
* VPB-01 ([aee7e2b](https://github.com/VenusProtocol/venus-protocol/commit/aee7e2b2a7f6f676086663a0e603e68b35abea1a))

## [7.3.0-dev.4](https://github.com/VenusProtocol/venus-protocol/compare/v7.3.0-dev.3...v7.3.0-dev.4) (2024-02-16)


### Features

* updating deployment files ([1b77d8d](https://github.com/VenusProtocol/venus-protocol/commit/1b77d8d52359191b81efe86b52527b55d017ded0))
* updating deployment files ([20325a8](https://github.com/VenusProtocol/venus-protocol/commit/20325a8e2b9aa8b6578d12740a03bd66be753454))
* updating deployment files ([1de1c22](https://github.com/VenusProtocol/venus-protocol/commit/1de1c22e8b3d05b96c339362074494bbb907c2c5))


### Bug Fixes

* lint ([4345032](https://github.com/VenusProtocol/venus-protocol/commit/434503240172da535ab2245c51cd3d7fccfbe330))
* remove outdated Comptroller deployment, fix deployment script and redeploy vFDUSD ([c4c6b3a](https://github.com/VenusProtocol/venus-protocol/commit/c4c6b3ad3f153700b9c95c547024b547dbc6f179))

## [7.3.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v7.3.0-dev.2...v7.3.0-dev.3) (2024-02-16)


### Features

* add ACM v8 to liquidator ([09a83b4](https://github.com/VenusProtocol/venus-protocol/commit/09a83b4a15273f6ff127c765b683d14f6b835322))
* add ACM v8 to liquidator ([8dbd1fa](https://github.com/VenusProtocol/venus-protocol/commit/8dbd1fa934f1aac36b2fea9cf6dae3d2764ee5df))
* add deployment script and upgrade bscmainnet liquidator implementation ([6cfb1ee](https://github.com/VenusProtocol/venus-protocol/commit/6cfb1ee3623ddf4188b389852ec361ea5fddce34))
* add deployments of liquidator ([da76f4a](https://github.com/VenusProtocol/venus-protocol/commit/da76f4a13a6901378d31ebd00bf0e1868980e924))
* add VAI liquidaton check ([a0c45c7](https://github.com/VenusProtocol/venus-protocol/commit/a0c45c73c83ea8bfd2faa41ddab36354ed63a92d))
* check force liquidation enabled ([40433a0](https://github.com/VenusProtocol/venus-protocol/commit/40433a0d8d922c363ec022be217bcc78782f090b))
* consider BNB collateral to reduce reserves ([b8dfe6a](https://github.com/VenusProtocol/venus-protocol/commit/b8dfe6a23bbe6c694b0b8306f9459249390c3b4a))
* updating deployment files ([c1fad3e](https://github.com/VenusProtocol/venus-protocol/commit/c1fad3e72a5e3f84834789a1b420af7a6504c314))
* updating deployment files ([1c9060b](https://github.com/VenusProtocol/venus-protocol/commit/1c9060b3b49357778bdeec676a52d18dad4666f5))
* VEN-1148 liquidation redeem and reduce reserves ([b2267aa](https://github.com/VenusProtocol/venus-protocol/commit/b2267aacdd60e9b5e6f8823baaed64c7029e9846))
* VEN-1308 add force VAI liquidation ([1101406](https://github.com/VenusProtocol/venus-protocol/commit/1101406763b89aa071a197beb2de09524024109c))
* VEN-1308 add force VAI liquidation ([491df3f](https://github.com/VenusProtocol/venus-protocol/commit/491df3ffd91fc44580f5c3d970228bf2d6b1a675))


### Bug Fixes

* add length checks and remove treasury contract address ([6000ae3](https://github.com/VenusProtocol/venus-protocol/commit/6000ae3cac9ac5353d5ba918caa7919f5225d42b))
* check redeem action ([3c9a57e](https://github.com/VenusProtocol/venus-protocol/commit/3c9a57edb607c178bc047d9538768208452ac2a8))
* checks and add netspac ([e95cf6c](https://github.com/VenusProtocol/venus-protocol/commit/e95cf6cef6631c2600ad98324c53b37f4ae37987))
* compile issue ([d26c448](https://github.com/VenusProtocol/venus-protocol/commit/d26c448ec9567ddacc608d2af422ba0838d4e962))
* fix test for liquidator ([da5b6eb](https://github.com/VenusProtocol/venus-protocol/commit/da5b6eb986fda1631a13b5df092a746598edeca0))
* fix test for liquidator ([598dd45](https://github.com/VenusProtocol/venus-protocol/commit/598dd45396f4bf14ae13ad86a037cc4648859944))
* liquidator tests ([8016d5f](https://github.com/VenusProtocol/venus-protocol/commit/8016d5fe5604f62ab67c6f87234e2f92279785d3))
* LLV-01 ([6d33c87](https://github.com/VenusProtocol/venus-protocol/commit/6d33c87e5cdd4ee2b97b2fd4f913af731650cf63))
* LLV-02 ([ead5354](https://github.com/VenusProtocol/venus-protocol/commit/ead535434acc71f932158bce3c4408f89539389f))
* LLV-03 ([c831054](https://github.com/VenusProtocol/venus-protocol/commit/c831054531b10ca1c7cd54f2f4549e9d4c84264f))
* LLV-06 ([925c44d](https://github.com/VenusProtocol/venus-protocol/commit/925c44d6840d68e2388483e1e3b3eeb57baf37bd))
* LLV-07 ([9555b7e](https://github.com/VenusProtocol/venus-protocol/commit/9555b7ef5937432c7893e93753ee70d693bf1d75))
* LLV-08 ([49f76b2](https://github.com/VenusProtocol/venus-protocol/commit/49f76b28f618f3d110708981b63595843171c87d))
* LLV-09 ([90bcafe](https://github.com/VenusProtocol/venus-protocol/commit/90bcafe9ce81135b62ae08d984ea4e00b22cc464))
* LLV-10 ([f79a308](https://github.com/VenusProtocol/venus-protocol/commit/f79a308b2c9ba7d0b684bbf8f90748e665b6f4f0))
* merge conflicts ([b09b2e2](https://github.com/VenusProtocol/venus-protocol/commit/b09b2e2e827ebc1aa9b7691f82829eb62a4a130f))
* minor ([ac1f746](https://github.com/VenusProtocol/venus-protocol/commit/ac1f7468788da6309b73c5a8a54f9137360b5317))
* minor fix ([8766208](https://github.com/VenusProtocol/venus-protocol/commit/87662084a19809ffd709427c47c9a8089e3ba5aa))
* minor fix ([d53178c](https://github.com/VenusProtocol/venus-protocol/commit/d53178c384f403b1a0b7f1b2a4c911a25bed0b14))
* N-01 Incorrect Docstring ([e4832bd](https://github.com/VenusProtocol/venus-protocol/commit/e4832bde9c8bf1fb701980ec929fef4175d52a4b))
* N-02 Improper Use of Named Return Variable ([a1ebea6](https://github.com/VenusProtocol/venus-protocol/commit/a1ebea63e65375137c4e829d9ec5960361d43dbc))
* N-03 Using int/uint Instead of int256/uint256 ([460db5a](https://github.com/VenusProtocol/venus-protocol/commit/460db5a97b575b4635b32b4317c358b5d9a29bf4))
* PVE-003 ([92ff328](https://github.com/VenusProtocol/venus-protocol/commit/92ff32882d42f8b6de01abdcd36de81286cd1443))
* resolve comments ([1d02ee1](https://github.com/VenusProtocol/venus-protocol/commit/1d02ee194c8c2c551ad65cd37d1db3fb1fc71197))
* resolve comments ([597a2ec](https://github.com/VenusProtocol/venus-protocol/commit/597a2ec13591bbbb92f06343fee721180e90db2c))
* resolve comments ([e33e0da](https://github.com/VenusProtocol/venus-protocol/commit/e33e0daff22decc9610e68ba30b12c970034ddf8))
* resolve comments ([a2e0d7e](https://github.com/VenusProtocol/venus-protocol/commit/a2e0d7ef35b53f73b869864ec37016e9955adc0e))
* tests ([8b00dff](https://github.com/VenusProtocol/venus-protocol/commit/8b00dff0af58611672fa63807b23d2fad1931fdd))
* tests ([2aead88](https://github.com/VenusProtocol/venus-protocol/commit/2aead88ced6d332c77a9744d79e7716b521fee85))
* typo ([61e8671](https://github.com/VenusProtocol/venus-protocol/commit/61e867134778c4fc34838e470075b557f36f23ce))
* ven-1658 ([6651191](https://github.com/VenusProtocol/venus-protocol/commit/665119148c76291f8a72d778b2e4140c7c80456c))
* VEN-3 ([5f39ba0](https://github.com/VenusProtocol/venus-protocol/commit/5f39ba0ee58a3c430075044c0f1ca919bb5759d5))
* VEN-8 ([f991967](https://github.com/VenusProtocol/venus-protocol/commit/f99196754ceea6e28ac69be3ad55cdce8d261339))
* VENUS-LIQUIDATOR-003 ([c42f1e2](https://github.com/VenusProtocol/venus-protocol/commit/c42f1e2b9ee92aaff708ebdb2f8a51a8a51b7127))
* VENUS-LIQUIDATOR-005 ([f64c645](https://github.com/VenusProtocol/venus-protocol/commit/f64c6459422a0f8e0ceb3afbdb3f4c63f793b354))
* VPB-01 ([aee7e2b](https://github.com/VenusProtocol/venus-protocol/commit/aee7e2b2a7f6f676086663a0e603e68b35abea1a))

## [7.3.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v7.3.0-dev.1...v7.3.0-dev.2) (2024-02-09)


### Features

* deployments of XVSVault on opbnbmainnet ([17bae92](https://github.com/VenusProtocol/venus-protocol/commit/17bae92107b61a6638ff60ed4df177c965f6da93))
* updating deployment files ([2f6106f](https://github.com/VenusProtocol/venus-protocol/commit/2f6106f8c8f429ebaa5c44a2eb74522deb58ea1b))

## [7.3.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v7.2.0...v7.3.0-dev.1) (2024-02-06)


### Features

* updating deployment files ([2a2fe93](https://github.com/VenusProtocol/venus-protocol/commit/2a2fe9337e3c4a45e83313e8d2bc37a3085042bb))


### Bug Fixes

* comptroller lens address on bsctestnet ([589cfb4](https://github.com/VenusProtocol/venus-protocol/commit/589cfb42d3bb4a37a5de576c89cdf8063a7c8a47))

## [7.2.0](https://github.com/VenusProtocol/venus-protocol/compare/v7.1.0...v7.2.0) (2024-01-25)


### Features

* use the version of PSR with Token converters ([f028cd5](https://github.com/VenusProtocol/venus-protocol/commit/f028cd5486c00287acc40a7625f368657cf070cc))

## [7.1.0](https://github.com/VenusProtocol/venus-protocol/compare/v7.0.0...v7.1.0) (2024-01-23)


### Features

* add a utility contract to redeem VBep20 tokens ([f345d39](https://github.com/VenusProtocol/venus-protocol/commit/f345d393145292af06a2f6a808916eab97d10638))
* add MoveDebtDelegate deployment ([b29dd2c](https://github.com/VenusProtocol/venus-protocol/commit/b29dd2c69e7f4d0f25ef06b78c66eab694c0dd46))
* add opbnbmainnet and verify config ([67bce33](https://github.com/VenusProtocol/venus-protocol/commit/67bce33f1a0e37a84b888b161bafb71eb999aa02))
* add xvs-vault deployments of opBNB Testnet ([6924d3e](https://github.com/VenusProtocol/venus-protocol/commit/6924d3e84925ac9f31ca35e36ccb660ddc3a3e11))
* add xvs-vault deployments of opBNB Testnet ([5d13784](https://github.com/VenusProtocol/venus-protocol/commit/5d13784e9db57dffd7c8cbfd81fd3799463f56d6))
* allow repaying in non-deprecated market ([ec1af79](https://github.com/VenusProtocol/venus-protocol/commit/ec1af79fedf3bfc8b11c6b302aab628bfb6fc691))
* bump version to the stable ones ([0b281cf](https://github.com/VenusProtocol/venus-protocol/commit/0b281cfb6f5fbf276aa9cf2abdca54e64190207c))
* deployments of XVSVault on ethereum ([41e8c5d](https://github.com/VenusProtocol/venus-protocol/commit/41e8c5d8ecb9b57618e9dde828aa6fab67102daf))
* updating deployment files ([3ed0079](https://github.com/VenusProtocol/venus-protocol/commit/3ed0079652becd7632b242cf611c85057ce35f08))
* updating deployment files ([822878a](https://github.com/VenusProtocol/venus-protocol/commit/822878af16b397c08e15bca88dfadc786e2fa6a0))
* updating deployment files ([dae0b3a](https://github.com/VenusProtocol/venus-protocol/commit/dae0b3af89a902c64264bfcb90066f3085c8bb1e))
* updating deployment files ([aad081c](https://github.com/VenusProtocol/venus-protocol/commit/aad081c40e8992cf7a17185257feeaef5e62d9fc))
* updating deployment files ([e274ea9](https://github.com/VenusProtocol/venus-protocol/commit/e274ea90a8d89f6a8f66ad930a0e741f6eef6d88))


### Bug Fixes

* redeployed prime ([244a085](https://github.com/VenusProtocol/venus-protocol/commit/244a0854b7e84f03ca7dfd5a0bf4cb03f6ae300b))

## [7.1.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v7.1.0-dev.2...v7.1.0-dev.3) (2024-01-23)


### Features

* add opbnbmainnet and verify config ([67bce33](https://github.com/VenusProtocol/venus-protocol/commit/67bce33f1a0e37a84b888b161bafb71eb999aa02))
* add xvs-vault deployments of opBNB Testnet ([6924d3e](https://github.com/VenusProtocol/venus-protocol/commit/6924d3e84925ac9f31ca35e36ccb660ddc3a3e11))
* add xvs-vault deployments of opBNB Testnet ([5d13784](https://github.com/VenusProtocol/venus-protocol/commit/5d13784e9db57dffd7c8cbfd81fd3799463f56d6))
* bump version to the stable ones ([0b281cf](https://github.com/VenusProtocol/venus-protocol/commit/0b281cfb6f5fbf276aa9cf2abdca54e64190207c))
* deployments of XVSVault on ethereum ([41e8c5d](https://github.com/VenusProtocol/venus-protocol/commit/41e8c5d8ecb9b57618e9dde828aa6fab67102daf))
* updating deployment files ([3ed0079](https://github.com/VenusProtocol/venus-protocol/commit/3ed0079652becd7632b242cf611c85057ce35f08))
* updating deployment files ([dae0b3a](https://github.com/VenusProtocol/venus-protocol/commit/dae0b3af89a902c64264bfcb90066f3085c8bb1e))
* updating deployment files ([aad081c](https://github.com/VenusProtocol/venus-protocol/commit/aad081c40e8992cf7a17185257feeaef5e62d9fc))
* updating deployment files ([e274ea9](https://github.com/VenusProtocol/venus-protocol/commit/e274ea90a8d89f6a8f66ad930a0e741f6eef6d88))


### Bug Fixes

* redeployed prime ([244a085](https://github.com/VenusProtocol/venus-protocol/commit/244a0854b7e84f03ca7dfd5a0bf4cb03f6ae300b))

## [7.1.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v7.1.0-dev.1...v7.1.0-dev.2) (2024-01-15)


### Features

* add MoveDebtDelegate deployment ([b29dd2c](https://github.com/VenusProtocol/venus-protocol/commit/b29dd2c69e7f4d0f25ef06b78c66eab694c0dd46))
* allow repaying in non-deprecated market ([ec1af79](https://github.com/VenusProtocol/venus-protocol/commit/ec1af79fedf3bfc8b11c6b302aab628bfb6fc691))
* updating deployment files ([822878a](https://github.com/VenusProtocol/venus-protocol/commit/822878af16b397c08e15bca88dfadc786e2fa6a0))

## [7.1.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v7.0.0...v7.1.0-dev.1) (2024-01-10)


### Features

* add a utility contract to redeem VBep20 tokens ([f345d39](https://github.com/VenusProtocol/venus-protocol/commit/f345d393145292af06a2f6a808916eab97d10638))

## [7.0.0](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.0...v7.0.0) (2023-12-29)


### ⚠ BREAKING CHANGES

* added missing await

### Features

* add deployments to hardhat config ([03581c8](https://github.com/VenusProtocol/venus-protocol/commit/03581c8b597b9c938efe9a0d6a768993807f7e87))
* add forced liquidations for individual accounts ([61795fa](https://github.com/VenusProtocol/venus-protocol/commit/61795fa08fecadc7d239648d69c6cd3fe9470274))
* add more info to APR ([313b8c5](https://github.com/VenusProtocol/venus-protocol/commit/313b8c584378cf95792b6b7e3b1d5c05f2dea2a7))
* add MoveDebt delegate borrower contract ([8e2c70c](https://github.com/VenusProtocol/venus-protocol/commit/8e2c70c926a5df863d1a24068ec4959ac9d389a8))
* add opbnbmainnet and verify config ([c3c983e](https://github.com/VenusProtocol/venus-protocol/commit/c3c983e52fb70cf2c5dd589d691a87ba92e18de4))
* add vtreasury for opbnb testnet ([e919595](https://github.com/VenusProtocol/venus-protocol/commit/e9195959c32fc7bcb309992f9ccb6075d3f2a525))
* add VTreasuryV8 opBnB Mainnet deployment ([d0bf4f5](https://github.com/VenusProtocol/venus-protocol/commit/d0bf4f5745d817ba4c7e08d414baf215c55d18eb))
* add xvs vault deployment script ([fd9d346](https://github.com/VenusProtocol/venus-protocol/commit/fd9d346b3a22a63a1c024853b175b425ec8dbd06))
* add xvs vault sepolia deployments ([10ae503](https://github.com/VenusProtocol/venus-protocol/commit/10ae5036d38f8aa7ca216cb24442462da0452f45))
* added missing await ([eba1ad0](https://github.com/VenusProtocol/venus-protocol/commit/eba1ad015e9571604cb3486a1de1926702fa8738))
* bump governance contract version ([3e1cf7f](https://github.com/VenusProtocol/venus-protocol/commit/3e1cf7f739050cbc31e298c6ff49f0b63e8a3018))
* export vtreasury deployments ([8477fef](https://github.com/VenusProtocol/venus-protocol/commit/8477feff6da7adcdb3419bb4c4d28eae0c8b6298))
* generate file only with addresses of deployed contracts ([f9c92bd](https://github.com/VenusProtocol/venus-protocol/commit/f9c92bd442fa9edaa79d72af2474afcdaee2224d))
* make moveDebt permissionless ([0889b85](https://github.com/VenusProtocol/venus-protocol/commit/0889b85ca01f89b63678e01e773d95cf1becc054))
* re-organize PLP storage layout to support TimeManagerV8 and deployment to mainnet ([0e584c3](https://github.com/VenusProtocol/venus-protocol/commit/0e584c38e93ad7f319af7a1efbb9121b52a2f001))
* redeployments of vaults ([e3e281a](https://github.com/VenusProtocol/venus-protocol/commit/e3e281ae1231c85d496a956bf06a03757b6efb36))
* updating deployment files ([cdb739e](https://github.com/VenusProtocol/venus-protocol/commit/cdb739e5e256f7b69692ce49f2ce013da3db406d))
* updating deployment files ([ec8991c](https://github.com/VenusProtocol/venus-protocol/commit/ec8991cd928ba4494e333b83efe1230af83aff4a))
* updating deployment files ([754d193](https://github.com/VenusProtocol/venus-protocol/commit/754d193c66d2c5a82f6fd86580f656990dbf58d1))
* updating deployment files ([3659966](https://github.com/VenusProtocol/venus-protocol/commit/36599660e745767ef4fb6235832b5ff70d87929d))
* updating deployment files ([f906fab](https://github.com/VenusProtocol/venus-protocol/commit/f906fab7a36535ef406b75588f6eac715875e721))
* updating deployment files ([589cb36](https://github.com/VenusProtocol/venus-protocol/commit/589cb36b54fea49911f4d3a758b637292c8c2303))
* updating deployment files ([68be77a](https://github.com/VenusProtocol/venus-protocol/commit/68be77a9cae3c050d1a4989d862ec53407967575))
* updating deployment files ([628e223](https://github.com/VenusProtocol/venus-protocol/commit/628e22352236dc1d56febdd1d5621461bb08d823))
* use main versions of venus dependencies ([cd1ae6d](https://github.com/VenusProtocol/venus-protocol/commit/cd1ae6d7bb16d9ad2e8ad346b5a7722b7dd68d6d))


### Bug Fixes

* added last accrued block for background compatibility ([d4ebc6d](https://github.com/VenusProtocol/venus-protocol/commit/d4ebc6d17ff98f78b0723780a71d10360b0259b4))
* added license to vai controller ([70b9156](https://github.com/VenusProtocol/venus-protocol/commit/70b9156c46885e69a31f4fb5635016cf0315990f))
* additional test ([16786f7](https://github.com/VenusProtocol/venus-protocol/commit/16786f756cfd560383c37dd2174e8dcc5d02cdb4))
* allow prime holders to only mint vai ([f103e2b](https://github.com/VenusProtocol/venus-protocol/commit/f103e2b66577a3005794661f458e0399f58a25be))
* changed arguments order ([d9a8c70](https://github.com/VenusProtocol/venus-protocol/commit/d9a8c70dba99adda255797a3c8e675e9c22a91aa))
* exclude external deployments when exporting ([6f01c43](https://github.com/VenusProtocol/venus-protocol/commit/6f01c4388f44094eaba865b52cbdc12c2e848493))
* fix signature ([7c64cbb](https://github.com/VenusProtocol/venus-protocol/commit/7c64cbb37e9a23c03f2e02b0830776a9e0ce3305))
* fix var ([c75e1b6](https://github.com/VenusProtocol/venus-protocol/commit/c75e1b684da02c98c9403a990efaac6876242f47))
* fix var ([a59da8a](https://github.com/VenusProtocol/venus-protocol/commit/a59da8a2f403ef727fe1c5c2e0b8a75cbd1cba55))
* fix var ([0711ee5](https://github.com/VenusProtocol/venus-protocol/commit/0711ee55aca26e979dffc901154373ff8baca76e))
* fix yarn.lock ([bcf9c7b](https://github.com/VenusProtocol/venus-protocol/commit/bcf9c7bf4153b8840b08fb94ae09f205606bc7f2))
* fixed integration tests ([d4050bd](https://github.com/VenusProtocol/venus-protocol/commit/d4050bd51deec88209c8da2d2ab0f244c57591a7))
* fixed lint ([6833dda](https://github.com/VenusProtocol/venus-protocol/commit/6833dda00dbf41ee13f30f6d0519deaab3c0a842))
* fixed lint ([f139982](https://github.com/VenusProtocol/venus-protocol/commit/f139982c66b18552155de555aecd4848d3fafe5a))
* fixed netspec ([ab9f887](https://github.com/VenusProtocol/venus-protocol/commit/ab9f88775f28e317fa202c391b63c137e61579f5))
* fixed tests ([5e50f1b](https://github.com/VenusProtocol/venus-protocol/commit/5e50f1b16f4eca6e8f05583189934998fddf251b))
* fixed tests ([eb86ae8](https://github.com/VenusProtocol/venus-protocol/commit/eb86ae85d8ba027350690afed3a6b928d624dd14))
* fixed vai tests ([7666743](https://github.com/VenusProtocol/venus-protocol/commit/766674326a8bc7728485eee27e507e5fea874754))
* import artifacts from governance-contracts ([c4d5b4e](https://github.com/VenusProtocol/venus-protocol/commit/c4d5b4eabddab146cfea90a0d5cca4e2e9582e5f))
* integrated TimeManager into PLP ([3f90aad](https://github.com/VenusProtocol/venus-protocol/commit/3f90aadf596f25a0bc7ed4f1cdccfcab4eada5dd))
* integration of time manager ([e8fdf72](https://github.com/VenusProtocol/venus-protocol/commit/e8fdf723c8ce280c36ff2f15a5705a5f9013dedc))
* ipi-01 ([e583d9c](https://github.com/VenusProtocol/venus-protocol/commit/e583d9c179dc0b766cd64dd4f269cbfce1ca0899))
* lint ([da9e3d7](https://github.com/VenusProtocol/venus-protocol/commit/da9e3d79a6924df7f9cd0b0c95e52d13522ee3f0))
* optional native wrapped token and market ([fe3018d](https://github.com/VenusProtocol/venus-protocol/commit/fe3018d90b6e1654dccb3f717018ec9e3ab0fc50))
* pass comptroller in addMarket ([9efa9cf](https://github.com/VenusProtocol/venus-protocol/commit/9efa9cf68e9dd62a7485942d519ad71431d5fbb9))
* ppt-01 ([d493a3d](https://github.com/VenusProtocol/venus-protocol/commit/d493a3dc11c8ba42c6c013b054fdbeb6b0bd6ea0))
* remove comment ([0a51f84](https://github.com/VenusProtocol/venus-protocol/commit/0a51f8461c4546fb5cb90d9672cafec90cc59714))
* remove duplicate contract ([d7265b9](https://github.com/VenusProtocol/venus-protocol/commit/d7265b93b762cebe93f9c3a7c48a0904027f3bd5))
* remove il repo dependency ([99b78b8](https://github.com/VenusProtocol/venus-protocol/commit/99b78b85dcb9b54ee66520e4df83ee58570cb8f5))
* removed additional check ([b858c7e](https://github.com/VenusProtocol/venus-protocol/commit/b858c7ebe089cc7911eeaf39adab3ccdf9c93686))
* resolved conflict ([aafcce5](https://github.com/VenusProtocol/venus-protocol/commit/aafcce5a8932fe2c17d55f91cf7aeeedff360f84))
* set vai address ([ef41f4e](https://github.com/VenusProtocol/venus-protocol/commit/ef41f4e34a752fb83ec3562a2059be0890ddb0a9))
* simplified logic and resolved comments ([5604db8](https://github.com/VenusProtocol/venus-protocol/commit/5604db8e21e43747ae7225e4f77d4c3a7f861053))
* uncomment setVAI function ([d270dcf](https://github.com/VenusProtocol/venus-protocol/commit/d270dcf84db7f90351df80e8c1ddcea0d5b24d94))
* update protocol-reserve package version ([3b79783](https://github.com/VenusProtocol/venus-protocol/commit/3b79783c218418f57764449307b6aedb9b4025a2))
* update toggle and prevent state update ([bfa811f](https://github.com/VenusProtocol/venus-protocol/commit/bfa811f4282425ca350c5f2dc2f084e554a6c25c))
* vai-01 ([2cd49f1](https://github.com/VenusProtocol/venus-protocol/commit/2cd49f19a056fc8ffd67bd5830625d8fc9d5e683))
* vat-01 ([f668c81](https://github.com/VenusProtocol/venus-protocol/commit/f668c8153144396dfaefc5330ff9d2cef3d779df))
* vat-01 ([b143947](https://github.com/VenusProtocol/venus-protocol/commit/b143947d4a93edc71d4c85ad7404db8a339b9ac6))
* vat-01 ([85d76b1](https://github.com/VenusProtocol/venus-protocol/commit/85d76b1b8ce8f840d04763fbe71e496321c2c0ba))
* vph-01 ([2a8d054](https://github.com/VenusProtocol/venus-protocol/commit/2a8d05448b2c20f2b6d0d0f2c97b3749f1deacb5))
* vph-01 ([7947142](https://github.com/VenusProtocol/venus-protocol/commit/79471425a98e90c048240121122c6b877fbb2fce))
* vph-01 ([5eb9df4](https://github.com/VenusProtocol/venus-protocol/commit/5eb9df469b18b1626d8da89fa3420f4908b3ab1e))
* vph-01 ([0701f27](https://github.com/VenusProtocol/venus-protocol/commit/0701f27ff4cbd35d4de5807f20f34418b9aeccd0))
* vph-01 ([e47ef15](https://github.com/VenusProtocol/venus-protocol/commit/e47ef15d223d64a4b6d18092e501af0ee85d69d9))
* vph-02 ([ba0ab11](https://github.com/VenusProtocol/venus-protocol/commit/ba0ab11b923d188f7e43405741bffbb903d828f4))

## [7.0.0-dev.5](https://github.com/VenusProtocol/venus-protocol/compare/v7.0.0-dev.4...v7.0.0-dev.5) (2023-12-28)

## [7.0.0-dev.4](https://github.com/VenusProtocol/venus-protocol/compare/v7.0.0-dev.3...v7.0.0-dev.4) (2023-12-28)


### Features

* redeployments of vaults ([e3e281a](https://github.com/VenusProtocol/venus-protocol/commit/e3e281ae1231c85d496a956bf06a03757b6efb36))
* updating deployment files ([ec8991c](https://github.com/VenusProtocol/venus-protocol/commit/ec8991cd928ba4494e333b83efe1230af83aff4a))

## [7.0.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v7.0.0-dev.2...v7.0.0-dev.3) (2023-12-27)


### Features

* re-organize PLP storage layout to support TimeManagerV8 and deployment to mainnet ([0e584c3](https://github.com/VenusProtocol/venus-protocol/commit/0e584c38e93ad7f319af7a1efbb9121b52a2f001))
* updating deployment files ([cdb739e](https://github.com/VenusProtocol/venus-protocol/commit/cdb739e5e256f7b69692ce49f2ce013da3db406d))
* use main versions of venus dependencies ([cd1ae6d](https://github.com/VenusProtocol/venus-protocol/commit/cd1ae6d7bb16d9ad2e8ad346b5a7722b7dd68d6d))

## [7.0.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v7.0.0-dev.1...v7.0.0-dev.2) (2023-12-22)

## [7.0.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.11...v7.0.0-dev.1) (2023-12-19)


### ⚠ BREAKING CHANGES

* added missing await

### Features

* add more info to APR ([313b8c5](https://github.com/VenusProtocol/venus-protocol/commit/313b8c584378cf95792b6b7e3b1d5c05f2dea2a7))
* added missing await ([eba1ad0](https://github.com/VenusProtocol/venus-protocol/commit/eba1ad015e9571604cb3486a1de1926702fa8738))


### Bug Fixes

* added last accrued block for background compatibility ([d4ebc6d](https://github.com/VenusProtocol/venus-protocol/commit/d4ebc6d17ff98f78b0723780a71d10360b0259b4))
* added license to vai controller ([70b9156](https://github.com/VenusProtocol/venus-protocol/commit/70b9156c46885e69a31f4fb5635016cf0315990f))
* additional test ([16786f7](https://github.com/VenusProtocol/venus-protocol/commit/16786f756cfd560383c37dd2174e8dcc5d02cdb4))
* allow prime holders to only mint vai ([f103e2b](https://github.com/VenusProtocol/venus-protocol/commit/f103e2b66577a3005794661f458e0399f58a25be))
* changed arguments order ([d9a8c70](https://github.com/VenusProtocol/venus-protocol/commit/d9a8c70dba99adda255797a3c8e675e9c22a91aa))
* fix signature ([7c64cbb](https://github.com/VenusProtocol/venus-protocol/commit/7c64cbb37e9a23c03f2e02b0830776a9e0ce3305))
* fix var ([c75e1b6](https://github.com/VenusProtocol/venus-protocol/commit/c75e1b684da02c98c9403a990efaac6876242f47))
* fix var ([a59da8a](https://github.com/VenusProtocol/venus-protocol/commit/a59da8a2f403ef727fe1c5c2e0b8a75cbd1cba55))
* fix var ([0711ee5](https://github.com/VenusProtocol/venus-protocol/commit/0711ee55aca26e979dffc901154373ff8baca76e))
* fixed integration tests ([d4050bd](https://github.com/VenusProtocol/venus-protocol/commit/d4050bd51deec88209c8da2d2ab0f244c57591a7))
* fixed lint ([6833dda](https://github.com/VenusProtocol/venus-protocol/commit/6833dda00dbf41ee13f30f6d0519deaab3c0a842))
* fixed tests ([5e50f1b](https://github.com/VenusProtocol/venus-protocol/commit/5e50f1b16f4eca6e8f05583189934998fddf251b))
* fixed tests ([eb86ae8](https://github.com/VenusProtocol/venus-protocol/commit/eb86ae85d8ba027350690afed3a6b928d624dd14))
* fixed vai tests ([7666743](https://github.com/VenusProtocol/venus-protocol/commit/766674326a8bc7728485eee27e507e5fea874754))
* integrated TimeManager into PLP ([3f90aad](https://github.com/VenusProtocol/venus-protocol/commit/3f90aadf596f25a0bc7ed4f1cdccfcab4eada5dd))
* integration of time manager ([e8fdf72](https://github.com/VenusProtocol/venus-protocol/commit/e8fdf723c8ce280c36ff2f15a5705a5f9013dedc))
* ipi-01 ([e583d9c](https://github.com/VenusProtocol/venus-protocol/commit/e583d9c179dc0b766cd64dd4f269cbfce1ca0899))
* lint ([da9e3d7](https://github.com/VenusProtocol/venus-protocol/commit/da9e3d79a6924df7f9cd0b0c95e52d13522ee3f0))
* ppt-01 ([d493a3d](https://github.com/VenusProtocol/venus-protocol/commit/d493a3dc11c8ba42c6c013b054fdbeb6b0bd6ea0))
* remove comment ([0a51f84](https://github.com/VenusProtocol/venus-protocol/commit/0a51f8461c4546fb5cb90d9672cafec90cc59714))
* remove duplicate contract ([d7265b9](https://github.com/VenusProtocol/venus-protocol/commit/d7265b93b762cebe93f9c3a7c48a0904027f3bd5))
* removed additional check ([b858c7e](https://github.com/VenusProtocol/venus-protocol/commit/b858c7ebe089cc7911eeaf39adab3ccdf9c93686))
* resolved conflict ([aafcce5](https://github.com/VenusProtocol/venus-protocol/commit/aafcce5a8932fe2c17d55f91cf7aeeedff360f84))
* set vai address ([ef41f4e](https://github.com/VenusProtocol/venus-protocol/commit/ef41f4e34a752fb83ec3562a2059be0890ddb0a9))
* simplified logic and resolved comments ([5604db8](https://github.com/VenusProtocol/venus-protocol/commit/5604db8e21e43747ae7225e4f77d4c3a7f861053))
* uncomment setVAI function ([d270dcf](https://github.com/VenusProtocol/venus-protocol/commit/d270dcf84db7f90351df80e8c1ddcea0d5b24d94))
* update toggle and prevent state update ([bfa811f](https://github.com/VenusProtocol/venus-protocol/commit/bfa811f4282425ca350c5f2dc2f084e554a6c25c))
* vai-01 ([2cd49f1](https://github.com/VenusProtocol/venus-protocol/commit/2cd49f19a056fc8ffd67bd5830625d8fc9d5e683))
* vat-01 ([f668c81](https://github.com/VenusProtocol/venus-protocol/commit/f668c8153144396dfaefc5330ff9d2cef3d779df))
* vat-01 ([b143947](https://github.com/VenusProtocol/venus-protocol/commit/b143947d4a93edc71d4c85ad7404db8a339b9ac6))
* vat-01 ([85d76b1](https://github.com/VenusProtocol/venus-protocol/commit/85d76b1b8ce8f840d04763fbe71e496321c2c0ba))
* vph-01 ([2a8d054](https://github.com/VenusProtocol/venus-protocol/commit/2a8d05448b2c20f2b6d0d0f2c97b3749f1deacb5))
* vph-01 ([7947142](https://github.com/VenusProtocol/venus-protocol/commit/79471425a98e90c048240121122c6b877fbb2fce))
* vph-01 ([5eb9df4](https://github.com/VenusProtocol/venus-protocol/commit/5eb9df469b18b1626d8da89fa3420f4908b3ab1e))
* vph-01 ([0701f27](https://github.com/VenusProtocol/venus-protocol/commit/0701f27ff4cbd35d4de5807f20f34418b9aeccd0))
* vph-01 ([e47ef15](https://github.com/VenusProtocol/venus-protocol/commit/e47ef15d223d64a4b6d18092e501af0ee85d69d9))
* vph-02 ([ba0ab11](https://github.com/VenusProtocol/venus-protocol/commit/ba0ab11b923d188f7e43405741bffbb903d828f4))

## [6.1.0-dev.11](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.10...v6.1.0-dev.11) (2023-12-18)

## [6.1.0-dev.10](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.9...v6.1.0-dev.10) (2023-12-18)


### Features

* add VTreasuryV8 opBnB Mainnet deployment ([d0bf4f5](https://github.com/VenusProtocol/venus-protocol/commit/d0bf4f5745d817ba4c7e08d414baf215c55d18eb))
* updating deployment files ([754d193](https://github.com/VenusProtocol/venus-protocol/commit/754d193c66d2c5a82f6fd86580f656990dbf58d1))

## [6.1.0-dev.9](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.8...v6.1.0-dev.9) (2023-12-18)


### Features

* updating deployment files ([3659966](https://github.com/VenusProtocol/venus-protocol/commit/36599660e745767ef4fb6235832b5ff70d87929d))

## [6.1.0-dev.8](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.7...v6.1.0-dev.8) (2023-12-14)


### Features

* add MoveDebt delegate borrower contract ([8e2c70c](https://github.com/VenusProtocol/venus-protocol/commit/8e2c70c926a5df863d1a24068ec4959ac9d389a8))
* make moveDebt permissionless ([0889b85](https://github.com/VenusProtocol/venus-protocol/commit/0889b85ca01f89b63678e01e773d95cf1becc054))

## [6.1.0-dev.7](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.6...v6.1.0-dev.7) (2023-12-12)


### Features

* updating deployment files ([f906fab](https://github.com/VenusProtocol/venus-protocol/commit/f906fab7a36535ef406b75588f6eac715875e721))


### Bug Fixes

* exclude external deployments when exporting ([6f01c43](https://github.com/VenusProtocol/venus-protocol/commit/6f01c4388f44094eaba865b52cbdc12c2e848493))

## [6.1.0-dev.6](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.5...v6.1.0-dev.6) (2023-12-07)


### Features

* add opbnbmainnet and verify config ([c3c983e](https://github.com/VenusProtocol/venus-protocol/commit/c3c983e52fb70cf2c5dd589d691a87ba92e18de4))
* add vtreasury for opbnb testnet ([e919595](https://github.com/VenusProtocol/venus-protocol/commit/e9195959c32fc7bcb309992f9ccb6075d3f2a525))
* export vtreasury deployments ([8477fef](https://github.com/VenusProtocol/venus-protocol/commit/8477feff6da7adcdb3419bb4c4d28eae0c8b6298))

## [6.1.0-dev.5](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.4...v6.1.0-dev.5) (2023-12-01)


### Features

* generate file only with addresses of deployed contracts ([f9c92bd](https://github.com/VenusProtocol/venus-protocol/commit/f9c92bd442fa9edaa79d72af2474afcdaee2224d))
* updating deployment files ([589cb36](https://github.com/VenusProtocol/venus-protocol/commit/589cb36b54fea49911f4d3a758b637292c8c2303))

## [6.1.0-dev.4](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.3...v6.1.0-dev.4) (2023-11-30)


### Bug Fixes

* fixed netspec ([ab9f887](https://github.com/VenusProtocol/venus-protocol/commit/ab9f88775f28e317fa202c391b63c137e61579f5))
* optional native wrapped token and market ([fe3018d](https://github.com/VenusProtocol/venus-protocol/commit/fe3018d90b6e1654dccb3f717018ec9e3ab0fc50))

## [6.1.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.2...v6.1.0-dev.3) (2023-11-29)


### Features

* add deployments to hardhat config ([03581c8](https://github.com/VenusProtocol/venus-protocol/commit/03581c8b597b9c938efe9a0d6a768993807f7e87))
* add xvs vault deployment script ([fd9d346](https://github.com/VenusProtocol/venus-protocol/commit/fd9d346b3a22a63a1c024853b175b425ec8dbd06))
* add xvs vault sepolia deployments ([10ae503](https://github.com/VenusProtocol/venus-protocol/commit/10ae5036d38f8aa7ca216cb24442462da0452f45))
* bump governance contract version ([3e1cf7f](https://github.com/VenusProtocol/venus-protocol/commit/3e1cf7f739050cbc31e298c6ff49f0b63e8a3018))
* updating deployment files ([68be77a](https://github.com/VenusProtocol/venus-protocol/commit/68be77a9cae3c050d1a4989d862ec53407967575))
* updating deployment files ([628e223](https://github.com/VenusProtocol/venus-protocol/commit/628e22352236dc1d56febdd1d5621461bb08d823))

## [6.1.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v6.1.0-dev.1...v6.1.0-dev.2) (2023-11-29)


### Bug Fixes

* fix yarn.lock ([bcf9c7b](https://github.com/VenusProtocol/venus-protocol/commit/bcf9c7bf4153b8840b08fb94ae09f205606bc7f2))
* import artifacts from governance-contracts ([c4d5b4e](https://github.com/VenusProtocol/venus-protocol/commit/c4d5b4eabddab146cfea90a0d5cca4e2e9582e5f))
* remove il repo dependency ([99b78b8](https://github.com/VenusProtocol/venus-protocol/commit/99b78b85dcb9b54ee66520e4df83ee58570cb8f5))

## [6.1.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.1-dev.2...v6.1.0-dev.1) (2023-11-29)


### Features

* add forced liquidations for individual accounts ([61795fa](https://github.com/VenusProtocol/venus-protocol/commit/61795fa08fecadc7d239648d69c6cd3fe9470274))

## [6.0.1-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.1-dev.1...v6.0.1-dev.2) (2023-11-28)


### Bug Fixes

* update protocol-reserve package version ([3b79783](https://github.com/VenusProtocol/venus-protocol/commit/3b79783c218418f57764449307b6aedb9b4025a2))

## [6.0.1-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.0...v6.0.1-dev.1) (2023-11-28)


### Bug Fixes

* fixed lint ([f139982](https://github.com/VenusProtocol/venus-protocol/commit/f139982c66b18552155de555aecd4848d3fafe5a))
* pass comptroller in addMarket ([9efa9cf](https://github.com/VenusProtocol/venus-protocol/commit/9efa9cf68e9dd62a7485942d519ad71431d5fbb9))

## [6.0.0](https://github.com/VenusProtocol/venus-protocol/compare/v5.2.0...v6.0.0) (2023-11-27)


### ⚠ BREAKING CHANGES

* removes network directory
* use transfer method for native transfers
* add VTresuryV8

### fixup

* use transfer method for native transfers ([80c7387](https://github.com/VenusProtocol/venus-protocol/commit/80c73874b647a85851cbcada95ce19e29cfbee1f))


### Features

* add mainnet deployments ([a769239](https://github.com/VenusProtocol/venus-protocol/commit/a769239570641a57f503c37ad287886188f27c91))
* add sepolia deployments of treasury ([e470b53](https://github.com/VenusProtocol/venus-protocol/commit/e470b534e77168b0e2124c075f2a922bbd72b43b))
* add testnet deployments ([90019c4](https://github.com/VenusProtocol/venus-protocol/commit/90019c420280addc99d903e17d651cc39ce32eea))
* add treasury ethereum deployments ([43e2763](https://github.com/VenusProtocol/venus-protocol/commit/43e27639693024064f8cdc9e62e81a9b778f790e))
* add vTreasury addresses to deployment files ([6aab03e](https://github.com/VenusProtocol/venus-protocol/commit/6aab03ed43537227a40229e09129bb3de4be3ce4))
* add VTresuryV8 ([2b87b14](https://github.com/VenusProtocol/venus-protocol/commit/2b87b148b61f4771eb2678b091982db31652a711))
* commit deployment updates in CI ([7132ab9](https://github.com/VenusProtocol/venus-protocol/commit/7132ab98096366f2769631b43ad054649a2c7d59))
* support exporting sepolia and ethereum deployments ([e441ee8](https://github.com/VenusProtocol/venus-protocol/commit/e441ee8101ce30aa1eff368f04a5fedeaa04907e))
* updating deployment files ([e6cba2a](https://github.com/VenusProtocol/venus-protocol/commit/e6cba2a38013e0623d8392ae6519a1c73019bec2))
* updating deployment files ([396d014](https://github.com/VenusProtocol/venus-protocol/commit/396d014bc67a7d1cf9869a8b6332d522a11560cc))
* updating deployment files ([1eb0235](https://github.com/VenusProtocol/venus-protocol/commit/1eb0235f91ff549f6dbacaa4f7937e2dea5fc7f2))
* updating deployment files ([089231f](https://github.com/VenusProtocol/venus-protocol/commit/089231f63a25607011fb252f9c578df1b3835088))
* updating deployment files ([5b71c61](https://github.com/VenusProtocol/venus-protocol/commit/5b71c615541fa867c222f81399e61232aaba8880))
* updating deployment files ([c824671](https://github.com/VenusProtocol/venus-protocol/commit/c8246715f3f44d9bed5e41217d3eb9ce045e904f))
* updating deployment files ([e275883](https://github.com/VenusProtocol/venus-protocol/commit/e27588350b62ead61950d072e565c062ac0e0e01))
* updating deployment files ([66493f6](https://github.com/VenusProtocol/venus-protocol/commit/66493f67a9bd0b5610aa27e54fab67d47b6bb0d5))
* updating deployment files ([2f49cc0](https://github.com/VenusProtocol/venus-protocol/commit/2f49cc0bcecf0515d775e745b62e7ddf45baf2db))


### Bug Fixes

* added tests ([f51f6f1](https://github.com/VenusProtocol/venus-protocol/commit/f51f6f1fa4fe71ef3a2e98af87aaef5ead3267e0))
* comment ([6128438](https://github.com/VenusProtocol/venus-protocol/commit/6128438a698cbd5d29cdf25da84b695e3044f5e0))
* comments ([ca7bb13](https://github.com/VenusProtocol/venus-protocol/commit/ca7bb135c9e182ac736e4ac8222699d68288d9a2))
* emit event for stakedAt update ([a500579](https://github.com/VenusProtocol/venus-protocol/commit/a500579467040e79773cea2b083766463566916b))
* re-deployed prime on mainnet ([012283c](https://github.com/VenusProtocol/venus-protocol/commit/012283c1f5280155f3ef90758485e5867c230411))
* re-deployed prime to testnet ([b66f101](https://github.com/VenusProtocol/venus-protocol/commit/b66f1018d39b18aad5112b2944277944e1526020))
* reference to address on string ([2cde12a](https://github.com/VenusProtocol/venus-protocol/commit/2cde12acdf598c428dec9cb043ae904d66a7d96b))
* typo ([acab6c6](https://github.com/VenusProtocol/venus-protocol/commit/acab6c6fb0c33387d0081b9797b8efb40127c362))
* VMC-10 ([818631f](https://github.com/VenusProtocol/venus-protocol/commit/818631f05e33e52e85df9c1a5d4d1c4bef503ad5))
* VMC-19 ([8a2da0f](https://github.com/VenusProtocol/venus-protocol/commit/8a2da0f2ede2cadc981531d5e226ac6aac558342))
* VMC-20 ([83ceb36](https://github.com/VenusProtocol/venus-protocol/commit/83ceb365ba6ca55997be0e925c0b8ffa755ac626))
* VMC-9 ([b9e3938](https://github.com/VenusProtocol/venus-protocol/commit/b9e3938dd2cba7605ff3aeb927dfb8ae6840a59e))


### Code Refactoring

* remove network directory ([a46c54b](https://github.com/VenusProtocol/venus-protocol/commit/a46c54b9ec49a46b4b7bd6c32d70a064cbd022d0))

## [6.0.0-dev.7](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.0-dev.6...v6.0.0-dev.7) (2023-11-27)


### Features

* updating deployment files ([e6cba2a](https://github.com/VenusProtocol/venus-protocol/commit/e6cba2a38013e0623d8392ae6519a1c73019bec2))

## [6.0.0-dev.6](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.0-dev.5...v6.0.0-dev.6) (2023-11-27)


### ⚠ BREAKING CHANGES

* removes network directory

### Features

* add mainnet deployments ([a769239](https://github.com/VenusProtocol/venus-protocol/commit/a769239570641a57f503c37ad287886188f27c91))
* add testnet deployments ([90019c4](https://github.com/VenusProtocol/venus-protocol/commit/90019c420280addc99d903e17d651cc39ce32eea))
* support exporting sepolia and ethereum deployments ([e441ee8](https://github.com/VenusProtocol/venus-protocol/commit/e441ee8101ce30aa1eff368f04a5fedeaa04907e))
* updating deployment files ([396d014](https://github.com/VenusProtocol/venus-protocol/commit/396d014bc67a7d1cf9869a8b6332d522a11560cc))
* updating deployment files ([1eb0235](https://github.com/VenusProtocol/venus-protocol/commit/1eb0235f91ff549f6dbacaa4f7937e2dea5fc7f2))


### Bug Fixes

* reference to address on string ([2cde12a](https://github.com/VenusProtocol/venus-protocol/commit/2cde12acdf598c428dec9cb043ae904d66a7d96b))


### Code Refactoring

* remove network directory ([a46c54b](https://github.com/VenusProtocol/venus-protocol/commit/a46c54b9ec49a46b4b7bd6c32d70a064cbd022d0))

## [6.0.0-dev.5](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.0-dev.4...v6.0.0-dev.5) (2023-11-23)


### Bug Fixes

* comment ([6128438](https://github.com/VenusProtocol/venus-protocol/commit/6128438a698cbd5d29cdf25da84b695e3044f5e0))

## [6.0.0-dev.4](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.0-dev.3...v6.0.0-dev.4) (2023-11-23)


### Features

* updating deployment files ([089231f](https://github.com/VenusProtocol/venus-protocol/commit/089231f63a25607011fb252f9c578df1b3835088))
* updating deployment files ([5b71c61](https://github.com/VenusProtocol/venus-protocol/commit/5b71c615541fa867c222f81399e61232aaba8880))
* updating deployment files ([c824671](https://github.com/VenusProtocol/venus-protocol/commit/c8246715f3f44d9bed5e41217d3eb9ce045e904f))


### Bug Fixes

* added tests ([f51f6f1](https://github.com/VenusProtocol/venus-protocol/commit/f51f6f1fa4fe71ef3a2e98af87aaef5ead3267e0))
* emit event for stakedAt update ([a500579](https://github.com/VenusProtocol/venus-protocol/commit/a500579467040e79773cea2b083766463566916b))
* re-deployed prime on mainnet ([012283c](https://github.com/VenusProtocol/venus-protocol/commit/012283c1f5280155f3ef90758485e5867c230411))
* re-deployed prime to testnet ([b66f101](https://github.com/VenusProtocol/venus-protocol/commit/b66f1018d39b18aad5112b2944277944e1526020))

## [6.0.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.0-dev.2...v6.0.0-dev.3) (2023-11-21)

## [6.0.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v6.0.0-dev.1...v6.0.0-dev.2) (2023-11-16)


### Features

* add vTreasury addresses to deployment files ([6aab03e](https://github.com/VenusProtocol/venus-protocol/commit/6aab03ed43537227a40229e09129bb3de4be3ce4))
* updating deployment files ([e275883](https://github.com/VenusProtocol/venus-protocol/commit/e27588350b62ead61950d072e565c062ac0e0e01))

## [6.0.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v5.2.0...v6.0.0-dev.1) (2023-11-16)


### ⚠ BREAKING CHANGES

* use transfer method for native transfers
* add VTresuryV8

### fixup

* use transfer method for native transfers ([80c7387](https://github.com/VenusProtocol/venus-protocol/commit/80c73874b647a85851cbcada95ce19e29cfbee1f))


### Features

* add sepolia deployments of treasury ([e470b53](https://github.com/VenusProtocol/venus-protocol/commit/e470b534e77168b0e2124c075f2a922bbd72b43b))
* add treasury ethereum deployments ([43e2763](https://github.com/VenusProtocol/venus-protocol/commit/43e27639693024064f8cdc9e62e81a9b778f790e))
* add VTresuryV8 ([2b87b14](https://github.com/VenusProtocol/venus-protocol/commit/2b87b148b61f4771eb2678b091982db31652a711))
* commit deployment updates in CI ([7132ab9](https://github.com/VenusProtocol/venus-protocol/commit/7132ab98096366f2769631b43ad054649a2c7d59))
* updating deployment files ([66493f6](https://github.com/VenusProtocol/venus-protocol/commit/66493f67a9bd0b5610aa27e54fab67d47b6bb0d5))
* updating deployment files ([2f49cc0](https://github.com/VenusProtocol/venus-protocol/commit/2f49cc0bcecf0515d775e745b62e7ddf45baf2db))


### Bug Fixes

* comments ([ca7bb13](https://github.com/VenusProtocol/venus-protocol/commit/ca7bb135c9e182ac736e4ac8222699d68288d9a2))
* typo ([acab6c6](https://github.com/VenusProtocol/venus-protocol/commit/acab6c6fb0c33387d0081b9797b8efb40127c362))
* VMC-10 ([818631f](https://github.com/VenusProtocol/venus-protocol/commit/818631f05e33e52e85df9c1a5d4d1c4bef503ad5))
* VMC-19 ([8a2da0f](https://github.com/VenusProtocol/venus-protocol/commit/8a2da0f2ede2cadc981531d5e226ac6aac558342))
* VMC-20 ([83ceb36](https://github.com/VenusProtocol/venus-protocol/commit/83ceb365ba6ca55997be0e925c0b8ffa755ac626))
* VMC-9 ([b9e3938](https://github.com/VenusProtocol/venus-protocol/commit/b9e3938dd2cba7605ff3aeb927dfb8ae6840a59e))

## [5.2.0](https://github.com/VenusProtocol/venus-protocol/compare/v5.1.0...v5.2.0) (2023-11-15)


### Features

* add all market getter for prime token ([edd6085](https://github.com/VenusProtocol/venus-protocol/commit/edd6085b0a75052b857b4ef9c3e4be8e141139d4))
* add Prime addresses ([aa181c0](https://github.com/VenusProtocol/venus-protocol/commit/aa181c0cc4746b8029bc202c2dcb9179bd7e94f5))
* add tests for tracking assets state ([82a2223](https://github.com/VenusProtocol/venus-protocol/commit/82a222374d929596723011ae34e718913941cf8b))
* added estimate APR ([0b2ee81](https://github.com/VenusProtocol/venus-protocol/commit/0b2ee816abb7af967c981ab8f7dba940467454c6))
* added rewards calc features for ui ([e348908](https://github.com/VenusProtocol/venus-protocol/commit/e348908701c02bd1a2fdd3af24512a3bfb49ad48))
* added solidity coverage ([2c93b78](https://github.com/VenusProtocol/venus-protocol/commit/2c93b789d3e914b2086dee8d43438790b09dea5b))
* added tests for plp integration ([00db9c9](https://github.com/VenusProtocol/venus-protocol/commit/00db9c957a7063781b2d9caad305d563942413a2))
* claim interest accept user address ([44d026b](https://github.com/VenusProtocol/venus-protocol/commit/44d026b386ba41689bab1435fc2902a083ff7f72))
* pause and unpuase interest claim ([7675fc5](https://github.com/VenusProtocol/venus-protocol/commit/7675fc5bbfefeaf11cd568674ea03d2c7a29a5f3))
* store assets part of prime market ([035871c](https://github.com/VenusProtocol/venus-protocol/commit/035871ce28ebd8de4795b7763db6b44c2cbc90b6))
* tests for APR estimation ([0fac919](https://github.com/VenusProtocol/venus-protocol/commit/0fac919869280f255fa6a3acb8b97e538faa9df4))
* user yearly apr ([5e5f016](https://github.com/VenusProtocol/venus-protocol/commit/5e5f0164cd83b67783b3a9cfd76957c899c24737))
* ven-1907 added pause/unpause funds transfer functionality ([9b945f7](https://github.com/VenusProtocol/venus-protocol/commit/9b945f72d70098d95f164effccf738ce5e6692f9))
* ven-1907 added sweep functionality in prime liquidity provider ([8a01cae](https://github.com/VenusProtocol/venus-protocol/commit/8a01cae9c4bdf2387e77acde28b25f539d6dec56))
* ven-1907 prime liquidity provider ([dbbdddb](https://github.com/VenusProtocol/venus-protocol/commit/dbbdddb4ceec27647fde9a03e898d60ca9c795e9))
* wip - deployment script ([3563370](https://github.com/VenusProtocol/venus-protocol/commit/35633702859bf4cc20c8fccb2be0aed7f041d822))


### Bug Fixes

* ability to upgrade user token ([a19e29c](https://github.com/VenusProtocol/venus-protocol/commit/a19e29c0bdfeb32124b52afb3453f417fd41fcdb))
* accrueTokens function ([33488f9](https://github.com/VenusProtocol/venus-protocol/commit/33488f9af5e3b5a3ae8347864dd3917e611aa160))
* added _setPrimeToken to interface ([1f737a5](https://github.com/VenusProtocol/venus-protocol/commit/1f737a5508245461420ca7bb4e0db25e36f92cdd))
* added access to netspec ([d69d289](https://github.com/VenusProtocol/venus-protocol/commit/d69d289f663efbf5f0fee21ce373ecbfd7cefe76))
* added comment for alpha ([7f13273](https://github.com/VenusProtocol/venus-protocol/commit/7f13273a7760fd020dae2fdf053532b2129a8b1d))
* added comment to setLiquidation ([69fe749](https://github.com/VenusProtocol/venus-protocol/commit/69fe74963b6af7f0cb48c9eac4f3cd0a832d4436))
* added ComptrollerV14Storage ([4eac835](https://github.com/VenusProtocol/venus-protocol/commit/4eac8359e3364df5898cb4b85b17f6f4c1f71b65))
* added errors to netspec ([22ceeef](https://github.com/VenusProtocol/venus-protocol/commit/22ceeef7ed2c97f1f0f08bb5da4bcc299d34134b))
* added events to netspec ([41a273b](https://github.com/VenusProtocol/venus-protocol/commit/41a273b3e429769ec21e9f91b1d3b28f643a250a))
* added function to get time remaining to claim ([b341b51](https://github.com/VenusProtocol/venus-protocol/commit/b341b518f2fe51190e8c28894caf3b31dd6e168e))
* added indexes ([e5e0021](https://github.com/VenusProtocol/venus-protocol/commit/e5e00211f7fd11a4fdd247e7ac48f540843f37aa))
* added license ([f0b12eb](https://github.com/VenusProtocol/venus-protocol/commit/f0b12eba506199247ba153a0d06ca844be6b580e))
* added markets to prime ([eba80c7](https://github.com/VenusProtocol/venus-protocol/commit/eba80c7ab169856fae0cb5f2d2f330c33884110d))
* added missing funcs in PLP interface ([14cca06](https://github.com/VenusProtocol/venus-protocol/commit/14cca06d676c85f16508bf203bef956f0642d3a8))
* added netspec ([431c53b](https://github.com/VenusProtocol/venus-protocol/commit/431c53b80a257b721081175630807fadb6651523))
* added security contact ([405f962](https://github.com/VenusProtocol/venus-protocol/commit/405f9629dd8ad4d17d447034e586c42bd43a2d0d))
* added solcover ([c28ec05](https://github.com/VenusProtocol/venus-protocol/commit/c28ec054d2fa4cdec8d7fbfab151a5e3fba2b7c1))
* added storage gap ([d9e1a6c](https://github.com/VenusProtocol/venus-protocol/commit/d9e1a6cc0f412fc34901afe6b42404506fd93be7))
* added vTokenForAsset ([25fa8b8](https://github.com/VenusProtocol/venus-protocol/commit/25fa8b879209dd23b0d75979b7358b15d357e21a))
* added workdlow dispatch ([27a701b](https://github.com/VenusProtocol/venus-protocol/commit/27a701baacb4d091cd51c55b006bd8244837ec26))
* alpha numerator cannot be zero ([19dd65f](https://github.com/VenusProtocol/venus-protocol/commit/19dd65fcadab28409e422d6ef8ad3a105e0149af))
* always accrue interest before updating score ([f5e3221](https://github.com/VenusProtocol/venus-protocol/commit/f5e32216191f7959a51d30687df5610af543eca5))
* change PendingInterest to PendingReward ([366366a](https://github.com/VenusProtocol/venus-protocol/commit/366366aecbf0252f9e82b61a1accbb223df79354))
* change visibility of storage vars ([5906eee](https://github.com/VenusProtocol/venus-protocol/commit/5906eeedb5e6b9f8aa01d97129eb92d47afee859))
* changes require to revert using custom errors ([073ec6a](https://github.com/VenusProtocol/venus-protocol/commit/073ec6a97dc812ca1aa62e2ede17b9bef1dffc47))
* check for fixed point number ([61ad1e7](https://github.com/VenusProtocol/venus-protocol/commit/61ad1e7a6dc5c1f6860152293f84335d617a1094))
* check for non-zero addresses ([a15c726](https://github.com/VenusProtocol/venus-protocol/commit/a15c726c84574b4a11d38bee31dededa5f2c78f8))
* check if valid pool then setting prime address ([ad5b11a](https://github.com/VenusProtocol/venus-protocol/commit/ad5b11ab8f678ae581b6d3f129b32798086221f9))
* check limit after upgrade ([b98dc82](https://github.com/VenusProtocol/venus-protocol/commit/b98dc821585667996eb6063946819d0e5cf1a2c6))
* create seperate comptroller interface ([b2ffbdb](https://github.com/VenusProtocol/venus-protocol/commit/b2ffbdb8124ab3149fe56c6ab59b364f184b47bf))
* deployed new prime contracts to testnet ([6f91a46](https://github.com/VenusProtocol/venus-protocol/commit/6f91a465f460e7f521c846ea8bce40a6cab9e545))
* deployed testing contracts to testnet ([a3721e1](https://github.com/VenusProtocol/venus-protocol/commit/a3721e1f6bd1285c88651d06446eb2e9ecbff2aa))
* deployed to mainnet ([d6f7a43](https://github.com/VenusProtocol/venus-protocol/commit/d6f7a436e59991f7cf42ddf953d14bc00b957276))
* deployed to testnet ([4c4a922](https://github.com/VenusProtocol/venus-protocol/commit/4c4a922337705e288a29fe91b33f35e4a63559b5))
* deployed to testnet for testing ([8da22f3](https://github.com/VenusProtocol/venus-protocol/commit/8da22f36dcfc1be3c9643b0f427a1ffa9228cf7c))
* distribute income from share reserve ([4dd8784](https://github.com/VenusProtocol/venus-protocol/commit/4dd8784cd7617f8add9ce331857085bf82d9113e))
* distribute liquidity in prime ([f6f788e](https://github.com/VenusProtocol/venus-protocol/commit/f6f788e1fab5a06315db95a48677d8edead7d0c4))
* dynamic xvs and staking period ([cc03d50](https://github.com/VenusProtocol/venus-protocol/commit/cc03d5091f6d4c678191fd4c19562c3efcf168db))
* emit event for prime token address update ([944c9e7](https://github.com/VenusProtocol/venus-protocol/commit/944c9e71a31a1a30a6c170d6eb17396b6af004c6))
* fix custom error for existing market ([8b38359](https://github.com/VenusProtocol/venus-protocol/commit/8b3835944f8780e161e1738e7c10e1771ec84588))
* fix DDoS attack on loop ([fc6a76e](https://github.com/VenusProtocol/venus-protocol/commit/fc6a76e29c6b59a03a9ca8f5b4072aa2b9492fa7))
* fix fixture deployment ([2b3ed5c](https://github.com/VenusProtocol/venus-protocol/commit/2b3ed5c6176e60571d20f8f7e2520e7b80b1c163))
* fix prime contract deployment in tests ([24d2dfc](https://github.com/VenusProtocol/venus-protocol/commit/24d2dfc86c3938cf1b3ddd978fb5233443248009))
* fixed alpha validation ([a7e913f](https://github.com/VenusProtocol/venus-protocol/commit/a7e913ff2bbc4489b8b76b2c01a07151ba0b2cdc))
* fixed certik findings ([e1cbc16](https://github.com/VenusProtocol/venus-protocol/commit/e1cbc1661853bd5d4c14c824de246e2082e05262))
* fixed complile error ([e4f68dc](https://github.com/VenusProtocol/venus-protocol/commit/e4f68dce759fa90704055aceea87cb5a0749724f))
* fixed conflict in tests ([a0a6c9a](https://github.com/VenusProtocol/venus-protocol/commit/a0a6c9a8435d283ba112b2bc095d402f1ad63dd9))
* fixed error message ([5bd807f](https://github.com/VenusProtocol/venus-protocol/commit/5bd807f705fdb9ba0c17385733b557649defb828))
* fixed integration tests ([38f3f7d](https://github.com/VenusProtocol/venus-protocol/commit/38f3f7ded3a762a41e98a447b2cbb22f086c7ec9))
* fixed lint ([e02832b](https://github.com/VenusProtocol/venus-protocol/commit/e02832bb2716bc0a178d910f6698877bf1b191e1))
* fixed lint ([13c4634](https://github.com/VenusProtocol/venus-protocol/commit/13c463459c8dba5d3cc78604f2b4ea6643d186e0))
* fixed lint ([2799cbb](https://github.com/VenusProtocol/venus-protocol/commit/2799cbbc6bb3c3946c90f100b5043368f738b6c5))
* fixed parameter naming inconsistency ([efd40ca](https://github.com/VenusProtocol/venus-protocol/commit/efd40ca015d3174f1025dfbc722a3f785ee3f1b3))
* fixed prime tests ([f2c71b1](https://github.com/VenusProtocol/venus-protocol/commit/f2c71b18022f3a41d124c2fabb5c3e19c11eb6dc))
* fixed storage collision ([df3cf73](https://github.com/VenusProtocol/venus-protocol/commit/df3cf7364f23466d35c7cae0d79631694293f8e6))
* fixed tests ([3ba980f](https://github.com/VenusProtocol/venus-protocol/commit/3ba980f98d68ceb94e98e05bdb7bdcbec7950136))
* fixed tests ([a22d97c](https://github.com/VenusProtocol/venus-protocol/commit/a22d97c1a1c07a6c26d1acb55452ce1c70c7b237))
* fixed tests ([529a463](https://github.com/VenusProtocol/venus-protocol/commit/529a4639875a0edf3b8190bf70a456cb111767a8))
* fixed tests ([2a06934](https://github.com/VenusProtocol/venus-protocol/commit/2a06934c33ddd7709a2928a61c25ee4b2b5d15de))
* fixed tests ([77fbe6f](https://github.com/VenusProtocol/venus-protocol/commit/77fbe6f099153712aaafc93d78cc369d6eab9f8f))
* fixed tests ([3332bc5](https://github.com/VenusProtocol/venus-protocol/commit/3332bc5d520eedd01214f1b9b1e51e5073bbd1e2))
* fixed xvsVault address ([ca73841](https://github.com/VenusProtocol/venus-protocol/commit/ca738412a1239776d82aba498813f6530a11be88))
* handle exceptions ([08aa05a](https://github.com/VenusProtocol/venus-protocol/commit/08aa05a5322e82994c10f2289524b65e048dea59))
* handle vbnb ([7db2fa6](https://github.com/VenusProtocol/venus-protocol/commit/7db2fa6767a8e1e97ddfa99109e057848ea507b8))
* improve length caching ([b20bd46](https://github.com/VenusProtocol/venus-protocol/commit/b20bd467359ac92da62bad6f84643ddeed202f8d))
* include income from PLP for estimating APR ([f40513d](https://github.com/VenusProtocol/venus-protocol/commit/f40513df7ac22bac0f040eed896dae56b51e04a6))
* increase gap ([35282ce](https://github.com/VenusProtocol/venus-protocol/commit/35282ce1ec69496e2fdce4aac2211fce64a81456))
* issued prime token on testnet ([9b3eef3](https://github.com/VenusProtocol/venus-protocol/commit/9b3eef39d53e90dd77c3dd9930157573f6b4510b))
* lint ([01b55a0](https://github.com/VenusProtocol/venus-protocol/commit/01b55a0a2a2798ee3723e88b9d4a7d01e45b0576))
* made staking period public and return if not eligible ([dbe21fa](https://github.com/VenusProtocol/venus-protocol/commit/dbe21fa34d5125081353934ff59f2bd9da306d44))
* make imports explicit ([adb8535](https://github.com/VenusProtocol/venus-protocol/commit/adb85352137dd6f2b596527d1133af0d98cece00))
* make xvs config public ([b71786f](https://github.com/VenusProtocol/venus-protocol/commit/b71786f146a7729206abfe383bebe3c0a0eba5c4))
* manually set stakedAt for existing xvs stakes ([7ecbe12](https://github.com/VenusProtocol/venus-protocol/commit/7ecbe12db4b3b92e7975ed63fc32e061824d3111))
* maxLoopsLimit setter implementation and minor fixes ([13a5c7e](https://github.com/VenusProtocol/venus-protocol/commit/13a5c7e5a721a85d19eeb609d28c30e2ecf03f9b))
* N1 ([a2e5372](https://github.com/VenusProtocol/venus-protocol/commit/a2e5372c7eaa8719005ff42aa0a2e21fb4f6ea95))
* N2 ([27c3924](https://github.com/VenusProtocol/venus-protocol/commit/27c39240ab9522e86917ebcd2e494a4494916e73))
* normalise capital in estimateAPR ([8ac02bc](https://github.com/VenusProtocol/venus-protocol/commit/8ac02bc898607d775969694469e012bfbcf1a3cc))
* optimise apr calculation ([5f9a15f](https://github.com/VenusProtocol/venus-protocol/commit/5f9a15f26818d972b1114838d7e8946c55bd53c4))
* optimise code ([e9aa4a8](https://github.com/VenusProtocol/venus-protocol/commit/e9aa4a8455fc69b6d7612e5e3a150f3a4ddc2d9a))
* optimise if condition ([2906abd](https://github.com/VenusProtocol/venus-protocol/commit/2906abd1ded175ddb289fa4e753a632b082fc1c4))
* optimised using internal funcs ([dae9c8e](https://github.com/VenusProtocol/venus-protocol/commit/dae9c8e63ef72f8d6473483c1d683ee40f314618))
* PLP-03 uses balance instead of amount_ ([c6b1495](https://github.com/VenusProtocol/venus-protocol/commit/c6b1495f13ad53d8cbf8657f45d56889f45d8800))
* PLP-07 | unprotected initializer ([7cb53b6](https://github.com/VenusProtocol/venus-protocol/commit/7cb53b6c003933c0e30b0dc4a97bbeeca1b9ebcc))
* PLP-08 | checks effects interactions pattern ([ed8dd08](https://github.com/VenusProtocol/venus-protocol/commit/ed8dd083999212689766e3b5cc4cfa92e8ec24a2))
* PPT-02 ([aafdacf](https://github.com/VenusProtocol/venus-protocol/commit/aafdacfe848e9b97e10830708b398d1b982fd41d))
* PPT-03 ([08229e6](https://github.com/VenusProtocol/venus-protocol/commit/08229e60c7a540b8832f32ccfb39af5464642d94))
* PPT-04 ([f73192b](https://github.com/VenusProtocol/venus-protocol/commit/f73192bd72ecb01fb4bab849e1dcba48c2fe5320))
* PPT-06 ([2c886b6](https://github.com/VenusProtocol/venus-protocol/commit/2c886b65f5546c21226af6e5fe273c776148f6e0))
* PPT-10 ([b2fa6d5](https://github.com/VenusProtocol/venus-protocol/commit/b2fa6d549ced74aa8254bb8d367ac240813aabcf))
* PPT-12 | Unnecessary Addition ([e9bbe5a](https://github.com/VenusProtocol/venus-protocol/commit/e9bbe5a807406cde6e1ed4bd040b862bd6923764))
* PPT-13 - optimised loops ([c7fa933](https://github.com/VenusProtocol/venus-protocol/commit/c7fa933b971b52418f1d10122e5024562d89e8c4))
* PPT-14 - Potential Out-of-Gas Exception ([23a9542](https://github.com/VenusProtocol/venus-protocol/commit/23a95428ee9bcc853593a345f0639a77b2ed483c))
* PPT-18 ([e882270](https://github.com/VenusProtocol/venus-protocol/commit/e88227062060fa5774c943e09358d7ec67d86f9a))
* PPT-19 ([70ddd0e](https://github.com/VenusProtocol/venus-protocol/commit/70ddd0e3b085b9e032437428079f7fe2c55700b6))
* PPT-20 - INEFFICIENT CHECK ([b5ac2fa](https://github.com/VenusProtocol/venus-protocol/commit/b5ac2fa398ca21cd4f2052ebb39fa72dfcb33e15))
* pr comments ([eabaa2a](https://github.com/VenusProtocol/venus-protocol/commit/eabaa2a9a83ec32b787c659c363ebfb648f03b57))
* pr comments ([d25438b](https://github.com/VenusProtocol/venus-protocol/commit/d25438bc3d4495a2fabf720ec08aebead0df4f6c))
* pr comments ([0ce6962](https://github.com/VenusProtocol/venus-protocol/commit/0ce69629170233d16184a62eaec618ea8ef3c1a5))
* PR comments ([98e4fca](https://github.com/VenusProtocol/venus-protocol/commit/98e4fcaf4fd49c247f031a25315f29b71720b1f2))
* prevent duplicate underlying asset ([7dbb4d8](https://github.com/VenusProtocol/venus-protocol/commit/7dbb4d88fa2220404769bd564949b40cef0ab76a))
* prevent irrevocable token burn and allow burn using vip ([22009c1](https://github.com/VenusProtocol/venus-protocol/commit/22009c1c53b45f4327af97805634b4a50e732741))
* prevent multiple calls to internal func and store in local var ([355b7a7](https://github.com/VenusProtocol/venus-protocol/commit/355b7a717d3c877213e5ef537cc7f957e38e4792))
* prevent oracle interface casting ([0b429fe](https://github.com/VenusProtocol/venus-protocol/commit/0b429fe5ee9d5e1bee780ebc26ee0cef357b457b))
* prevent pendingScoreUpdates corruption during minting ([dab203f](https://github.com/VenusProtocol/venus-protocol/commit/dab203f882359193b3bf5ff7f1a33fec19abd468))
* prevent resetting unclaimed interest ([f31a054](https://github.com/VenusProtocol/venus-protocol/commit/f31a0543da039dab69112c6be3e36ea54959503b))
* prevent revert if score is already updated ([b6c6736](https://github.com/VenusProtocol/venus-protocol/commit/b6c673627530cbd34b068ffb2a2b1f4c4ab87d21))
* prevent updateAssetsState from reverting ([6b81bb2](https://github.com/VenusProtocol/venus-protocol/commit/6b81bb213716ef74448e2111b90bce7656742f43))
* PTP-05 ([91b2474](https://github.com/VenusProtocol/venus-protocol/commit/91b247497b83db509e11146a71e98fcabe843ae7))
* PTP-05 ([eb36a3f](https://github.com/VenusProtocol/venus-protocol/commit/eb36a3fd43e9381e4ad2dd2e4646f84685043577))
* PTP-05 | Missing And Incomplete NatSpec Comments ([2abb751](https://github.com/VenusProtocol/venus-protocol/commit/2abb751c90ca3517141deb1d852a35ebb036070e))
* PTP-07 | missing input validation ([f7d463b](https://github.com/VenusProtocol/venus-protocol/commit/f7d463b4c9e3467aea026ce33d0f3f643ada3022))
* PVE001 ([05bcd40](https://github.com/VenusProtocol/venus-protocol/commit/05bcd400d1665ef5916d7eaca9083c44d328c99e))
* PVE002 ([3128c23](https://github.com/VenusProtocol/venus-protocol/commit/3128c231a32d03e198b47c97553e9d2f25b65ba1))
* PVE003 ([c9e0809](https://github.com/VenusProtocol/venus-protocol/commit/c9e08094760cc4b07907c079fb3a73e07c2670e7))
* PVE003-2 ([34c3ea5](https://github.com/VenusProtocol/venus-protocol/commit/34c3ea5e0bcaaa8ffae1c56c81362c67fdcaad10))
* PVE004 ([03839e5](https://github.com/VenusProtocol/venus-protocol/commit/03839e5253cd25837b1f17ffd9391a7a870fb586))
* redeployed prime ([6846f09](https://github.com/VenusProtocol/venus-protocol/commit/6846f09df2ad87cf23e7613bc251b79ab99c4741))
* redeployed prime ([26d30f6](https://github.com/VenusProtocol/venus-protocol/commit/26d30f6310dfe0a841c1205a4e024b5cb20b65e4))
* redeployed prime contracts ([425d2c7](https://github.com/VenusProtocol/venus-protocol/commit/425d2c797d8423db2202a4c5f58bb7d265ecb188))
* redeployed testnet contracts ([fc9e1bc](https://github.com/VenusProtocol/venus-protocol/commit/fc9e1bc3230af741a653b4d6f5b0e556057c82cf))
* release funds when claim has insufficient balance ([33ce30c](https://github.com/VenusProtocol/venus-protocol/commit/33ce30ccc9865b0ffb87e33b97191ed9dca410d3))
* releaseFund() for plp ([8029c8c](https://github.com/VenusProtocol/venus-protocol/commit/8029c8cacdefd52a8022017062406abb0ec3ed9e))
* remove _alphaDenominator check ([efa219a](https://github.com/VenusProtocol/venus-protocol/commit/efa219aa33811647bed0ae2ca5100648eb36eb9a))
* remove _updateRoundAfterTokenMinted ([e2f0e17](https://github.com/VenusProtocol/venus-protocol/commit/e2f0e170314fc366e0a1d60350cb0d23fc63299a))
* remove 0 assignment ([c1dddbc](https://github.com/VenusProtocol/venus-protocol/commit/c1dddbcb72e154e8dc84d63e27e039c1aaf30696))
* remove comment ([6e08d89](https://github.com/VenusProtocol/venus-protocol/commit/6e08d89daecbc0656f0eaf9fac956a9994033213))
* remove comments ([66f25fc](https://github.com/VenusProtocol/venus-protocol/commit/66f25fc7e7f543d0f59610d6ceba1fdc3b43fa21))
* remove console ([54a8ce9](https://github.com/VenusProtocol/venus-protocol/commit/54a8ce9a25aa3cd82955ee8163afe9e4734555df))
* remove error strings from tests ([e355c77](https://github.com/VenusProtocol/venus-protocol/commit/e355c770c4c3562df513512dff1f4e00a0832882))
* remove gap from PLP ([425381d](https://github.com/VenusProtocol/venus-protocol/commit/425381df43e48c0603a73b722c763dbf1d33db15))
* remove index multiplier ([64a297a](https://github.com/VenusProtocol/venus-protocol/commit/64a297a992204e3213369616e185ac9cc8fbd02f))
* remove invocation of update score on liquidate borrow verify ([b6ca5e3](https://github.com/VenusProtocol/venus-protocol/commit/b6ca5e36594d310aaccbf1f70388b4b0e4cb9ac4))
* remove prime from VTokenInterface ([3d570bc](https://github.com/VenusProtocol/venus-protocol/commit/3d570bcea2744b15a7b0f0984d6fe4ffdb23642f))
* remove PSR dependency ([aae7c6d](https://github.com/VenusProtocol/venus-protocol/commit/aae7c6d7902e6900e26b72f77a21babc718fbf20))
* remove unused errors ([ef28b34](https://github.com/VenusProtocol/venus-protocol/commit/ef28b347fbe142a432657ba1c00db76cd818dec3))
* remove unused erros ([44ec28a](https://github.com/VenusProtocol/venus-protocol/commit/44ec28a832fa276cf8f51d530c9107bdcc22d838))
* remove unused event ([ccccb30](https://github.com/VenusProtocol/venus-protocol/commit/ccccb30623a3cbe7105efd8e03a2d3db394192c7))
* remove unused import ([3f48666](https://github.com/VenusProtocol/venus-protocol/commit/3f48666ebfd1287bd4c8ca50fee7001c6da43b8d))
* remove unused interface functions ([3c3e2ee](https://github.com/VenusProtocol/venus-protocol/commit/3c3e2eef0aa99d28485ef0b288f85dc328c2fefc))
* remove unused state var ([e94a190](https://github.com/VenusProtocol/venus-protocol/commit/e94a190b220e40e572c939c680dc92e166a7acb9))
* remove unused state variable ([12bf107](https://github.com/VenusProtocol/venus-protocol/commit/12bf1070326b29bef53a4f4440c08aa7d0fd60da))
* remove unused var ([74ac28b](https://github.com/VenusProtocol/venus-protocol/commit/74ac28b38f8d981a826b518bf19679446dbd5f77))
* remove unused var comment ([17553c5](https://github.com/VenusProtocol/venus-protocol/commit/17553c584f53bc9d7e533b12fb078ba5fcbbe036))
* remove unwanted check ([e18f896](https://github.com/VenusProtocol/venus-protocol/commit/e18f896f7e62dab0152eeb912bb1cda62e1655d5))
* remove unwanted comments ([bc7d823](https://github.com/VenusProtocol/venus-protocol/commit/bc7d823848dd4c744829d74583ce0178d5f289f5))
* remove unwanted zero check ([4ce9d4c](https://github.com/VenusProtocol/venus-protocol/commit/4ce9d4cfd039e578b51235af0e67ea5022e0d7f4))
* remove unwated check ([d2e80f3](https://github.com/VenusProtocol/venus-protocol/commit/d2e80f3f24ad9baf9d1295d90225dbe7dd84c582))
* remove virtual from initializer ([1e16352](https://github.com/VenusProtocol/venus-protocol/commit/1e16352b623aa9d5d45ee9e1020067d0eef2c8dc))
* removed doc ([995799b](https://github.com/VenusProtocol/venus-protocol/commit/995799b414d634dacc77f6d5bbf6f7f820aaf4d8))
* removed getMarketDecimals ([6f4311b](https://github.com/VenusProtocol/venus-protocol/commit/6f4311b795e920e671f7dd613e7d687744454ec0))
* removed psr ([18efa60](https://github.com/VenusProtocol/venus-protocol/commit/18efa60dea0e39de23d0f9096d0486978852e62b))
* removed unchecked ([4bcc2f0](https://github.com/VenusProtocol/venus-protocol/commit/4bcc2f015c58c58f4893c494a47c507682de306a))
* removed unused function ([386929e](https://github.com/VenusProtocol/venus-protocol/commit/386929eaf158955dc219603cc21789394c19d20d))
* replace account and owner with user ([b54917c](https://github.com/VenusProtocol/venus-protocol/commit/b54917cd456eb581b017964b10e454b7803ff5ff))
* replace score with sumOfMembersScore in tests ([7e835a0](https://github.com/VenusProtocol/venus-protocol/commit/7e835a08598f6cf7ee90f8ab0f806ab4ff445375))
* replece memory with calldata ([0272882](https://github.com/VenusProtocol/venus-protocol/commit/0272882e45c277a2c4e46d1a4f14c7a38876a725))
* resolve conflict with diamond controller ([935f4cf](https://github.com/VenusProtocol/venus-protocol/commit/935f4cf80b872034be7bf30e275e27ba66dc2d5b))
* resolved conflict ([bd8e177](https://github.com/VenusProtocol/venus-protocol/commit/bd8e1778673fe5a3f55c905f71cbf13d6c63ce3b))
* resolved conflicts ([a1a59e1](https://github.com/VenusProtocol/venus-protocol/commit/a1a59e1acfc6612d1531b1e76bc8e583b7c2463f))
* resolved merge conflicts ([e7419a3](https://github.com/VenusProtocol/venus-protocol/commit/e7419a310c5b08fc98a313912c49f14d74dfa81d))
* resolved merge conflicts ([1b4fa63](https://github.com/VenusProtocol/venus-protocol/commit/1b4fa633742bfa951e05c762d114028e6130b7cd))
* revert apr calc changes ([ec2f4fd](https://github.com/VenusProtocol/venus-protocol/commit/ec2f4fdf1d6614c57af9a26a235cb6588f07056a))
* revert fix ([4120434](https://github.com/VenusProtocol/venus-protocol/commit/412043425cd6dae83e9233752769b0b164160e39))
* set default max distribution speed ([e7b7ff5](https://github.com/VenusProtocol/venus-protocol/commit/e7b7ff541dcf882525dcf215eb21eeb76cf8cc46))
* setter for prime token ([3619c58](https://github.com/VenusProtocol/venus-protocol/commit/3619c58a2079e21e48d6b5ff94a2a9517108443e))
* simplify check ([5a04aa0](https://github.com/VenusProtocol/venus-protocol/commit/5a04aa0354c3d5bbf6a91234547920c7f52a65cc))
* SPT-01 - normalise decimals ([27f8485](https://github.com/VenusProtocol/venus-protocol/commit/27f84855dc74ebdad9a144103d2db06b0db4ec76))
* SPV-01 - not allow alpha equal 1 ([64daba3](https://github.com/VenusProtocol/venus-protocol/commit/64daba3f757085585a705f685e86e468580c0eb5))
* stop accruing prime interest in comptroller ([f0df7f5](https://github.com/VenusProtocol/venus-protocol/commit/f0df7f54d3601d306b99da68e06726b4c77c8679))
* test for releaseFund ([022ac1d](https://github.com/VenusProtocol/venus-protocol/commit/022ac1d827b0f43b7eb31cc07a094c330181b8f5))
* test with custom errors ([aefb359](https://github.com/VenusProtocol/venus-protocol/commit/aefb35927d4e256968eca69db07d72468bf3dc5b))
* transfer plp ownership ([d265149](https://github.com/VenusProtocol/venus-protocol/commit/d2651494dca9ce74825110c092c98e17d3ef3015))
* transferred ownership ([0da9316](https://github.com/VenusProtocol/venus-protocol/commit/0da9316ed646e10b4b458486abe0dbd43cc8c24c))
* uncommented ([7232958](https://github.com/VenusProtocol/venus-protocol/commit/72329583ca69ab104a2fd84c44b988049b553564))
* uncommented code ([0b4883b](https://github.com/VenusProtocol/venus-protocol/commit/0b4883b1d31be3ada0101ccd7a813540acc01eca))
* update config ([9e08627](https://github.com/VenusProtocol/venus-protocol/commit/9e086271de726fee5d72cf7716f953cb47e168ab))
* update config ([6c4ca78](https://github.com/VenusProtocol/venus-protocol/commit/6c4ca785799f8516a446df32d15252100e3f2ef0))
* update config ([60654be](https://github.com/VenusProtocol/venus-protocol/commit/60654be1f350e144bfc305c3fc26efe4d1a93430))
* update config ([4dddbe2](https://github.com/VenusProtocol/venus-protocol/commit/4dddbe29ffbc2b499c66364991b70d457ba2b0ea))
* update config ([22696e1](https://github.com/VenusProtocol/venus-protocol/commit/22696e1b4a42357bb280a271eca847c0f11ed4b0))
* update score and reset user when token is burned ([0c6ddc7](https://github.com/VenusProtocol/venus-protocol/commit/0c6ddc755fcc646dd2ca51c82e6356e5e7f988ff))
* update score when borror is liquidated ([7cc8232](https://github.com/VenusProtocol/venus-protocol/commit/7cc82326e0f5e07d3997a3bec659b81d6254e29e))
* update scores for borrowed market during liquidation ([44a5411](https://github.com/VenusProtocol/venus-protocol/commit/44a54110b0993426aee3fbf30d75af0b394b2e1c))
* update stakedAt only in xvsUpdated function ([9d31816](https://github.com/VenusProtocol/venus-protocol/commit/9d318165333b5ae4d2350a4b674d7d7237066642))
* updated CI ([a2718b1](https://github.com/VenusProtocol/venus-protocol/commit/a2718b19c2cfcdbcf46aa9f62eecdf01527bc7ec))
* updated comment ([cbadb37](https://github.com/VenusProtocol/venus-protocol/commit/cbadb37ba9e444189037dded253fbd11d46994b6))
* updated schema enum ([2552b4d](https://github.com/VenusProtocol/venus-protocol/commit/2552b4db74eb3d40e387563faba477af470f5573))
* updated xvs max limit and setPrime permissions ([860c959](https://github.com/VenusProtocol/venus-protocol/commit/860c9598465b0e67092f838e3c5ee2faf7c1b664))
* updated yarn ([a9a89a1](https://github.com/VenusProtocol/venus-protocol/commit/a9a89a10984892d9805f9dd7d4c8a3752075e6d2))
* use capped amounts to calculate supply and borrow income ([2c7f65c](https://github.com/VenusProtocol/venus-protocol/commit/2c7f65c4aec8193dd9d63f77c90e2422ee52fdbb))
* use capped supply, borrow and xvs for score calculation ([9e9efe5](https://github.com/VenusProtocol/venus-protocol/commit/9e9efe50a9e04c60566f2bc7b51b304c0bcf28e3))
* use delete ([5af2748](https://github.com/VenusProtocol/venus-protocol/commit/5af27488693213cd1fc9a8659a440d33e5c5b634))
* use not equal not ([6581db1](https://github.com/VenusProtocol/venus-protocol/commit/6581db184c2245cfb590d5b74d54fd94b0ab5e64))
* use pre-decrement ([0af7678](https://github.com/VenusProtocol/venus-protocol/commit/0af7678f1e80a7fbc73a18b86a3d9f407ed7fa41))
* use pre-fix instead of post-fix ([21deff7](https://github.com/VenusProtocol/venus-protocol/commit/21deff7d6158a42abc0044639227dde884060489))
* use same values in testnet and mainnet ([8b169c3](https://github.com/VenusProtocol/venus-protocol/commit/8b169c3a31a3b5607f15573399ba12d4d473b43a))
* use uint256 instead of uint ([e9269c7](https://github.com/VenusProtocol/venus-protocol/commit/e9269c7f3da8706a29271e35155dd5f7231a33b3))
* use underlying token decimals ([f1fecac](https://github.com/VenusProtocol/venus-protocol/commit/f1fecacada4bb5d7e4b8cad5b6ca498f2d0d16be))
* use usd cap for supply and borrow ([38c7345](https://github.com/VenusProtocol/venus-protocol/commit/38c7345d03c79bd37fdd58fb595684532c66d99b))
* use usd to caps - wip ([4b68619](https://github.com/VenusProtocol/venus-protocol/commit/4b68619fac8c42befa56bff0602812df27dba878))
* validate timestamp ([a8aef0f](https://github.com/VenusProtocol/venus-protocol/commit/a8aef0f29f418aa31c570fdff417aeeda47aa436))
* ven-2016 g-06 ([5505bf7](https://github.com/VenusProtocol/venus-protocol/commit/5505bf7c2503f3228f3421b45ee749fce2c2921a))
* ven-2016 g-07 ([240f16f](https://github.com/VenusProtocol/venus-protocol/commit/240f16f6cc53fa06a6389dfbb6fa821eb2b41b04))
* ven-2016 g-15 ([e8f0ced](https://github.com/VenusProtocol/venus-protocol/commit/e8f0ced5abaabb64ff124433022574a7a63384dc))
* ven-2016 g-25 ([28e266d](https://github.com/VenusProtocol/venus-protocol/commit/28e266db4a44e2cdf305f329247ce4ed96cce5ac))
* ven-2016 g-26 ([460c794](https://github.com/VenusProtocol/venus-protocol/commit/460c794b4177b751d2e1f934c06a0f12e12f4114))
* ven-2016 g-31 ([751f1aa](https://github.com/VenusProtocol/venus-protocol/commit/751f1aa62d6d5efbc08ef69c071f2e40bf344acd))
* ven-2016 l-01 ([db5cc29](https://github.com/VenusProtocol/venus-protocol/commit/db5cc29ec7e5410c36c9431f2783e1917b897be5))
* ven-2016 l-02 ([df9e9af](https://github.com/VenusProtocol/venus-protocol/commit/df9e9af4b009bf138dfce8965f07f1c555b3686a))
* ven-2016 l-04 ([2bce045](https://github.com/VenusProtocol/venus-protocol/commit/2bce045f48d65ce0d84266c9df5ba7613ed5dc75))
* ven-2016 l-09 ([7897fa7](https://github.com/VenusProtocol/venus-protocol/commit/7897fa7042df13920c98d0e7ead0c969b22bfd46))
* ven-2016 n-04 ([7d6c63c](https://github.com/VenusProtocol/venus-protocol/commit/7d6c63ce21f7793d84b01dc622894aa91ad34685))
* ven-2016 n-09 ([4ac7e84](https://github.com/VenusProtocol/venus-protocol/commit/4ac7e849c0acc2ed9371efe6b87e40d599900d01))
* ven-2016 n-13 ([92052a2](https://github.com/VenusProtocol/venus-protocol/commit/92052a2ba53dc2ca9598a0e7ae8063b2d1b314bd))
* ven-2016 n-19 ([6523ce7](https://github.com/VenusProtocol/venus-protocol/commit/6523ce7f0a99de966eb638251721dade4662c536))
* ven-2016 n-21 ([f055f7e](https://github.com/VenusProtocol/venus-protocol/commit/f055f7e8965ec426c997a3b392483030fc94a63f))
* ven-2016 n-23 ([3cb7618](https://github.com/VenusProtocol/venus-protocol/commit/3cb76189c4ed1ff39afa04da4b7e40a58025f67d))
* ven-2016 n-27 ([2baa889](https://github.com/VenusProtocol/venus-protocol/commit/2baa88933b2e5262d1d555ff1dfe72f4237a7416))
* ven-2016 n-29 ([acfb5a7](https://github.com/VenusProtocol/venus-protocol/commit/acfb5a7f8c8a1ba5a8b3d7b469558298eca61b6f))
* ven-2016 n-31 n-32 n-34 ([027f5fe](https://github.com/VenusProtocol/venus-protocol/commit/027f5fe65ed4687b7c05cdd291d942eae628794e))
* ven-2016 n-35 ([91eb342](https://github.com/VenusProtocol/venus-protocol/commit/91eb342c4bb9420d63a39e2bd1eb02768b22fdf5))
* ven-2016 n-36 ([86e7037](https://github.com/VenusProtocol/venus-protocol/commit/86e70374a0d96a831ecd38ef91913c6157e1fdfa))
* ven-2016 n-38 for plp prime setter ([ca5aa1f](https://github.com/VenusProtocol/venus-protocol/commit/ca5aa1f4047e2021f15b29d4d3ebc37de01ebc32))
* ven-2016 n-44 ([fec60ec](https://github.com/VenusProtocol/venus-protocol/commit/fec60ec8718bb102e4a0d54904cde97fead6e9f6))
* ven-2016 n-45 ([e4cb911](https://github.com/VenusProtocol/venus-protocol/commit/e4cb911408c1c58c0a8a6cbdc0b9c503a8092a57))
* ven-2016 n-46 ([1b839df](https://github.com/VenusProtocol/venus-protocol/commit/1b839df58d0cca3d93d13eb5fa1fc347d7c24afd))
* ven-2016 n-47 ([8968822](https://github.com/VenusProtocol/venus-protocol/commit/896882215c4514f4b379ddc65759efb378b232ff))
* ven-2016 n-48 ([0d21911](https://github.com/VenusProtocol/venus-protocol/commit/0d219112c3114ebfb70457faf158a3f315cfdd84))
* ven-2016 n-49 ([06a74ab](https://github.com/VenusProtocol/venus-protocol/commit/06a74ab61f0db50bd3736854e513e0dbe934e2f0))
* ven-2016 n-52 updated oz contracts package version ([21aedde](https://github.com/VenusProtocol/venus-protocol/commit/21aeddedcdfa552c9b891c8a697a58a752919146))
* ven-2017 ([b0ff7ba](https://github.com/VenusProtocol/venus-protocol/commit/b0ff7ba0f5e304f6b88bedfc13b20d125dc026e6))
* VEN-2050 ([26fd196](https://github.com/VenusProtocol/venus-protocol/commit/26fd196485b0e91bd5486fe45a4f5c42dee5d782))
* VEN-2053 ([acaf138](https://github.com/VenusProtocol/venus-protocol/commit/acaf1387a559c25f2373be60de2dc8f84868ad75))
* VEN-2055 ([8c0fa82](https://github.com/VenusProtocol/venus-protocol/commit/8c0fa82e3a0d5e557e95b4e337b0b07316757d84))
* VPB-01 ([42c565b](https://github.com/VenusProtocol/venus-protocol/commit/42c565b52fa3a1d43f1df4d7249ddcfc6a9d83a6))
* VPB-01 ([7fbe58a](https://github.com/VenusProtocol/venus-protocol/commit/7fbe58a77cb97dc5da992ee26593701bfab54f4a))
* VPB-01 | Typos and Inconsistencies ([17d5c2a](https://github.com/VenusProtocol/venus-protocol/commit/17d5c2ad1e12b2129eda814dee95d4eb6c465e4c))
* wip-deployment ([fefb688](https://github.com/VenusProtocol/venus-protocol/commit/fefb6883d46b2b2039f010728bcff87bd9adf6d4))


### Reverts

* alpha numerator cannot be zero ([e8d8ba2](https://github.com/VenusProtocol/venus-protocol/commit/e8d8ba25bf290ff710c669882972d570953fcd48))

## [5.2.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v5.2.0-dev.2...v5.2.0-dev.3) (2023-11-15)

## [5.2.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v5.2.0-dev.1...v5.2.0-dev.2) (2023-11-14)


### Features

* add Prime addresses ([aa181c0](https://github.com/VenusProtocol/venus-protocol/commit/aa181c0cc4746b8029bc202c2dcb9179bd7e94f5))

## [5.2.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v5.1.0...v5.2.0-dev.1) (2023-11-14)


### Features

* add all market getter for prime token ([edd6085](https://github.com/VenusProtocol/venus-protocol/commit/edd6085b0a75052b857b4ef9c3e4be8e141139d4))
* add tests for tracking assets state ([82a2223](https://github.com/VenusProtocol/venus-protocol/commit/82a222374d929596723011ae34e718913941cf8b))
* added estimate APR ([0b2ee81](https://github.com/VenusProtocol/venus-protocol/commit/0b2ee816abb7af967c981ab8f7dba940467454c6))
* added rewards calc features for ui ([e348908](https://github.com/VenusProtocol/venus-protocol/commit/e348908701c02bd1a2fdd3af24512a3bfb49ad48))
* added solidity coverage ([2c93b78](https://github.com/VenusProtocol/venus-protocol/commit/2c93b789d3e914b2086dee8d43438790b09dea5b))
* added tests for plp integration ([00db9c9](https://github.com/VenusProtocol/venus-protocol/commit/00db9c957a7063781b2d9caad305d563942413a2))
* claim interest accept user address ([44d026b](https://github.com/VenusProtocol/venus-protocol/commit/44d026b386ba41689bab1435fc2902a083ff7f72))
* pause and unpuase interest claim ([7675fc5](https://github.com/VenusProtocol/venus-protocol/commit/7675fc5bbfefeaf11cd568674ea03d2c7a29a5f3))
* store assets part of prime market ([035871c](https://github.com/VenusProtocol/venus-protocol/commit/035871ce28ebd8de4795b7763db6b44c2cbc90b6))
* tests for APR estimation ([0fac919](https://github.com/VenusProtocol/venus-protocol/commit/0fac919869280f255fa6a3acb8b97e538faa9df4))
* user yearly apr ([5e5f016](https://github.com/VenusProtocol/venus-protocol/commit/5e5f0164cd83b67783b3a9cfd76957c899c24737))
* ven-1907 added pause/unpause funds transfer functionality ([9b945f7](https://github.com/VenusProtocol/venus-protocol/commit/9b945f72d70098d95f164effccf738ce5e6692f9))
* ven-1907 added sweep functionality in prime liquidity provider ([8a01cae](https://github.com/VenusProtocol/venus-protocol/commit/8a01cae9c4bdf2387e77acde28b25f539d6dec56))
* ven-1907 prime liquidity provider ([dbbdddb](https://github.com/VenusProtocol/venus-protocol/commit/dbbdddb4ceec27647fde9a03e898d60ca9c795e9))
* wip - deployment script ([3563370](https://github.com/VenusProtocol/venus-protocol/commit/35633702859bf4cc20c8fccb2be0aed7f041d822))


### Bug Fixes

* ability to upgrade user token ([a19e29c](https://github.com/VenusProtocol/venus-protocol/commit/a19e29c0bdfeb32124b52afb3453f417fd41fcdb))
* accrueTokens function ([33488f9](https://github.com/VenusProtocol/venus-protocol/commit/33488f9af5e3b5a3ae8347864dd3917e611aa160))
* added _setPrimeToken to interface ([1f737a5](https://github.com/VenusProtocol/venus-protocol/commit/1f737a5508245461420ca7bb4e0db25e36f92cdd))
* added access to netspec ([d69d289](https://github.com/VenusProtocol/venus-protocol/commit/d69d289f663efbf5f0fee21ce373ecbfd7cefe76))
* added comment for alpha ([7f13273](https://github.com/VenusProtocol/venus-protocol/commit/7f13273a7760fd020dae2fdf053532b2129a8b1d))
* added comment to setLiquidation ([69fe749](https://github.com/VenusProtocol/venus-protocol/commit/69fe74963b6af7f0cb48c9eac4f3cd0a832d4436))
* added ComptrollerV14Storage ([4eac835](https://github.com/VenusProtocol/venus-protocol/commit/4eac8359e3364df5898cb4b85b17f6f4c1f71b65))
* added errors to netspec ([22ceeef](https://github.com/VenusProtocol/venus-protocol/commit/22ceeef7ed2c97f1f0f08bb5da4bcc299d34134b))
* added events to netspec ([41a273b](https://github.com/VenusProtocol/venus-protocol/commit/41a273b3e429769ec21e9f91b1d3b28f643a250a))
* added function to get time remaining to claim ([b341b51](https://github.com/VenusProtocol/venus-protocol/commit/b341b518f2fe51190e8c28894caf3b31dd6e168e))
* added indexes ([e5e0021](https://github.com/VenusProtocol/venus-protocol/commit/e5e00211f7fd11a4fdd247e7ac48f540843f37aa))
* added license ([f0b12eb](https://github.com/VenusProtocol/venus-protocol/commit/f0b12eba506199247ba153a0d06ca844be6b580e))
* added markets to prime ([eba80c7](https://github.com/VenusProtocol/venus-protocol/commit/eba80c7ab169856fae0cb5f2d2f330c33884110d))
* added missing funcs in PLP interface ([14cca06](https://github.com/VenusProtocol/venus-protocol/commit/14cca06d676c85f16508bf203bef956f0642d3a8))
* added netspec ([431c53b](https://github.com/VenusProtocol/venus-protocol/commit/431c53b80a257b721081175630807fadb6651523))
* added security contact ([405f962](https://github.com/VenusProtocol/venus-protocol/commit/405f9629dd8ad4d17d447034e586c42bd43a2d0d))
* added solcover ([c28ec05](https://github.com/VenusProtocol/venus-protocol/commit/c28ec054d2fa4cdec8d7fbfab151a5e3fba2b7c1))
* added storage gap ([d9e1a6c](https://github.com/VenusProtocol/venus-protocol/commit/d9e1a6cc0f412fc34901afe6b42404506fd93be7))
* added vTokenForAsset ([25fa8b8](https://github.com/VenusProtocol/venus-protocol/commit/25fa8b879209dd23b0d75979b7358b15d357e21a))
* added workdlow dispatch ([27a701b](https://github.com/VenusProtocol/venus-protocol/commit/27a701baacb4d091cd51c55b006bd8244837ec26))
* alpha numerator cannot be zero ([19dd65f](https://github.com/VenusProtocol/venus-protocol/commit/19dd65fcadab28409e422d6ef8ad3a105e0149af))
* always accrue interest before updating score ([f5e3221](https://github.com/VenusProtocol/venus-protocol/commit/f5e32216191f7959a51d30687df5610af543eca5))
* change PendingInterest to PendingReward ([366366a](https://github.com/VenusProtocol/venus-protocol/commit/366366aecbf0252f9e82b61a1accbb223df79354))
* change visibility of storage vars ([5906eee](https://github.com/VenusProtocol/venus-protocol/commit/5906eeedb5e6b9f8aa01d97129eb92d47afee859))
* changes require to revert using custom errors ([073ec6a](https://github.com/VenusProtocol/venus-protocol/commit/073ec6a97dc812ca1aa62e2ede17b9bef1dffc47))
* check for fixed point number ([61ad1e7](https://github.com/VenusProtocol/venus-protocol/commit/61ad1e7a6dc5c1f6860152293f84335d617a1094))
* check for non-zero addresses ([a15c726](https://github.com/VenusProtocol/venus-protocol/commit/a15c726c84574b4a11d38bee31dededa5f2c78f8))
* check if valid pool then setting prime address ([ad5b11a](https://github.com/VenusProtocol/venus-protocol/commit/ad5b11ab8f678ae581b6d3f129b32798086221f9))
* check limit after upgrade ([b98dc82](https://github.com/VenusProtocol/venus-protocol/commit/b98dc821585667996eb6063946819d0e5cf1a2c6))
* create seperate comptroller interface ([b2ffbdb](https://github.com/VenusProtocol/venus-protocol/commit/b2ffbdb8124ab3149fe56c6ab59b364f184b47bf))
* deployed new prime contracts to testnet ([6f91a46](https://github.com/VenusProtocol/venus-protocol/commit/6f91a465f460e7f521c846ea8bce40a6cab9e545))
* deployed testing contracts to testnet ([a3721e1](https://github.com/VenusProtocol/venus-protocol/commit/a3721e1f6bd1285c88651d06446eb2e9ecbff2aa))
* deployed to mainnet ([d6f7a43](https://github.com/VenusProtocol/venus-protocol/commit/d6f7a436e59991f7cf42ddf953d14bc00b957276))
* deployed to testnet ([4c4a922](https://github.com/VenusProtocol/venus-protocol/commit/4c4a922337705e288a29fe91b33f35e4a63559b5))
* deployed to testnet for testing ([8da22f3](https://github.com/VenusProtocol/venus-protocol/commit/8da22f36dcfc1be3c9643b0f427a1ffa9228cf7c))
* distribute income from share reserve ([4dd8784](https://github.com/VenusProtocol/venus-protocol/commit/4dd8784cd7617f8add9ce331857085bf82d9113e))
* distribute liquidity in prime ([f6f788e](https://github.com/VenusProtocol/venus-protocol/commit/f6f788e1fab5a06315db95a48677d8edead7d0c4))
* dynamic xvs and staking period ([cc03d50](https://github.com/VenusProtocol/venus-protocol/commit/cc03d5091f6d4c678191fd4c19562c3efcf168db))
* emit event for prime token address update ([944c9e7](https://github.com/VenusProtocol/venus-protocol/commit/944c9e71a31a1a30a6c170d6eb17396b6af004c6))
* fix custom error for existing market ([8b38359](https://github.com/VenusProtocol/venus-protocol/commit/8b3835944f8780e161e1738e7c10e1771ec84588))
* fix DDoS attack on loop ([fc6a76e](https://github.com/VenusProtocol/venus-protocol/commit/fc6a76e29c6b59a03a9ca8f5b4072aa2b9492fa7))
* fix fixture deployment ([2b3ed5c](https://github.com/VenusProtocol/venus-protocol/commit/2b3ed5c6176e60571d20f8f7e2520e7b80b1c163))
* fix prime contract deployment in tests ([24d2dfc](https://github.com/VenusProtocol/venus-protocol/commit/24d2dfc86c3938cf1b3ddd978fb5233443248009))
* fixed alpha validation ([a7e913f](https://github.com/VenusProtocol/venus-protocol/commit/a7e913ff2bbc4489b8b76b2c01a07151ba0b2cdc))
* fixed certik findings ([e1cbc16](https://github.com/VenusProtocol/venus-protocol/commit/e1cbc1661853bd5d4c14c824de246e2082e05262))
* fixed complile error ([e4f68dc](https://github.com/VenusProtocol/venus-protocol/commit/e4f68dce759fa90704055aceea87cb5a0749724f))
* fixed conflict in tests ([a0a6c9a](https://github.com/VenusProtocol/venus-protocol/commit/a0a6c9a8435d283ba112b2bc095d402f1ad63dd9))
* fixed error message ([5bd807f](https://github.com/VenusProtocol/venus-protocol/commit/5bd807f705fdb9ba0c17385733b557649defb828))
* fixed integration tests ([38f3f7d](https://github.com/VenusProtocol/venus-protocol/commit/38f3f7ded3a762a41e98a447b2cbb22f086c7ec9))
* fixed lint ([e02832b](https://github.com/VenusProtocol/venus-protocol/commit/e02832bb2716bc0a178d910f6698877bf1b191e1))
* fixed lint ([13c4634](https://github.com/VenusProtocol/venus-protocol/commit/13c463459c8dba5d3cc78604f2b4ea6643d186e0))
* fixed lint ([2799cbb](https://github.com/VenusProtocol/venus-protocol/commit/2799cbbc6bb3c3946c90f100b5043368f738b6c5))
* fixed parameter naming inconsistency ([efd40ca](https://github.com/VenusProtocol/venus-protocol/commit/efd40ca015d3174f1025dfbc722a3f785ee3f1b3))
* fixed prime tests ([f2c71b1](https://github.com/VenusProtocol/venus-protocol/commit/f2c71b18022f3a41d124c2fabb5c3e19c11eb6dc))
* fixed storage collision ([df3cf73](https://github.com/VenusProtocol/venus-protocol/commit/df3cf7364f23466d35c7cae0d79631694293f8e6))
* fixed tests ([3ba980f](https://github.com/VenusProtocol/venus-protocol/commit/3ba980f98d68ceb94e98e05bdb7bdcbec7950136))
* fixed tests ([a22d97c](https://github.com/VenusProtocol/venus-protocol/commit/a22d97c1a1c07a6c26d1acb55452ce1c70c7b237))
* fixed tests ([529a463](https://github.com/VenusProtocol/venus-protocol/commit/529a4639875a0edf3b8190bf70a456cb111767a8))
* fixed tests ([2a06934](https://github.com/VenusProtocol/venus-protocol/commit/2a06934c33ddd7709a2928a61c25ee4b2b5d15de))
* fixed tests ([77fbe6f](https://github.com/VenusProtocol/venus-protocol/commit/77fbe6f099153712aaafc93d78cc369d6eab9f8f))
* fixed tests ([3332bc5](https://github.com/VenusProtocol/venus-protocol/commit/3332bc5d520eedd01214f1b9b1e51e5073bbd1e2))
* fixed xvsVault address ([ca73841](https://github.com/VenusProtocol/venus-protocol/commit/ca738412a1239776d82aba498813f6530a11be88))
* handle exceptions ([08aa05a](https://github.com/VenusProtocol/venus-protocol/commit/08aa05a5322e82994c10f2289524b65e048dea59))
* handle vbnb ([7db2fa6](https://github.com/VenusProtocol/venus-protocol/commit/7db2fa6767a8e1e97ddfa99109e057848ea507b8))
* improve length caching ([b20bd46](https://github.com/VenusProtocol/venus-protocol/commit/b20bd467359ac92da62bad6f84643ddeed202f8d))
* include income from PLP for estimating APR ([f40513d](https://github.com/VenusProtocol/venus-protocol/commit/f40513df7ac22bac0f040eed896dae56b51e04a6))
* increase gap ([35282ce](https://github.com/VenusProtocol/venus-protocol/commit/35282ce1ec69496e2fdce4aac2211fce64a81456))
* issued prime token on testnet ([9b3eef3](https://github.com/VenusProtocol/venus-protocol/commit/9b3eef39d53e90dd77c3dd9930157573f6b4510b))
* lint ([01b55a0](https://github.com/VenusProtocol/venus-protocol/commit/01b55a0a2a2798ee3723e88b9d4a7d01e45b0576))
* made staking period public and return if not eligible ([dbe21fa](https://github.com/VenusProtocol/venus-protocol/commit/dbe21fa34d5125081353934ff59f2bd9da306d44))
* make imports explicit ([adb8535](https://github.com/VenusProtocol/venus-protocol/commit/adb85352137dd6f2b596527d1133af0d98cece00))
* make xvs config public ([b71786f](https://github.com/VenusProtocol/venus-protocol/commit/b71786f146a7729206abfe383bebe3c0a0eba5c4))
* manually set stakedAt for existing xvs stakes ([7ecbe12](https://github.com/VenusProtocol/venus-protocol/commit/7ecbe12db4b3b92e7975ed63fc32e061824d3111))
* maxLoopsLimit setter implementation and minor fixes ([13a5c7e](https://github.com/VenusProtocol/venus-protocol/commit/13a5c7e5a721a85d19eeb609d28c30e2ecf03f9b))
* N1 ([a2e5372](https://github.com/VenusProtocol/venus-protocol/commit/a2e5372c7eaa8719005ff42aa0a2e21fb4f6ea95))
* N2 ([27c3924](https://github.com/VenusProtocol/venus-protocol/commit/27c39240ab9522e86917ebcd2e494a4494916e73))
* normalise capital in estimateAPR ([8ac02bc](https://github.com/VenusProtocol/venus-protocol/commit/8ac02bc898607d775969694469e012bfbcf1a3cc))
* optimise apr calculation ([5f9a15f](https://github.com/VenusProtocol/venus-protocol/commit/5f9a15f26818d972b1114838d7e8946c55bd53c4))
* optimise code ([e9aa4a8](https://github.com/VenusProtocol/venus-protocol/commit/e9aa4a8455fc69b6d7612e5e3a150f3a4ddc2d9a))
* optimise if condition ([2906abd](https://github.com/VenusProtocol/venus-protocol/commit/2906abd1ded175ddb289fa4e753a632b082fc1c4))
* optimised using internal funcs ([dae9c8e](https://github.com/VenusProtocol/venus-protocol/commit/dae9c8e63ef72f8d6473483c1d683ee40f314618))
* PLP-03 uses balance instead of amount_ ([c6b1495](https://github.com/VenusProtocol/venus-protocol/commit/c6b1495f13ad53d8cbf8657f45d56889f45d8800))
* PLP-07 | unprotected initializer ([7cb53b6](https://github.com/VenusProtocol/venus-protocol/commit/7cb53b6c003933c0e30b0dc4a97bbeeca1b9ebcc))
* PLP-08 | checks effects interactions pattern ([ed8dd08](https://github.com/VenusProtocol/venus-protocol/commit/ed8dd083999212689766e3b5cc4cfa92e8ec24a2))
* PPT-02 ([aafdacf](https://github.com/VenusProtocol/venus-protocol/commit/aafdacfe848e9b97e10830708b398d1b982fd41d))
* PPT-03 ([08229e6](https://github.com/VenusProtocol/venus-protocol/commit/08229e60c7a540b8832f32ccfb39af5464642d94))
* PPT-04 ([f73192b](https://github.com/VenusProtocol/venus-protocol/commit/f73192bd72ecb01fb4bab849e1dcba48c2fe5320))
* PPT-06 ([2c886b6](https://github.com/VenusProtocol/venus-protocol/commit/2c886b65f5546c21226af6e5fe273c776148f6e0))
* PPT-10 ([b2fa6d5](https://github.com/VenusProtocol/venus-protocol/commit/b2fa6d549ced74aa8254bb8d367ac240813aabcf))
* PPT-12 | Unnecessary Addition ([e9bbe5a](https://github.com/VenusProtocol/venus-protocol/commit/e9bbe5a807406cde6e1ed4bd040b862bd6923764))
* PPT-13 - optimised loops ([c7fa933](https://github.com/VenusProtocol/venus-protocol/commit/c7fa933b971b52418f1d10122e5024562d89e8c4))
* PPT-14 - Potential Out-of-Gas Exception ([23a9542](https://github.com/VenusProtocol/venus-protocol/commit/23a95428ee9bcc853593a345f0639a77b2ed483c))
* PPT-18 ([e882270](https://github.com/VenusProtocol/venus-protocol/commit/e88227062060fa5774c943e09358d7ec67d86f9a))
* PPT-19 ([70ddd0e](https://github.com/VenusProtocol/venus-protocol/commit/70ddd0e3b085b9e032437428079f7fe2c55700b6))
* PPT-20 - INEFFICIENT CHECK ([b5ac2fa](https://github.com/VenusProtocol/venus-protocol/commit/b5ac2fa398ca21cd4f2052ebb39fa72dfcb33e15))
* pr comments ([eabaa2a](https://github.com/VenusProtocol/venus-protocol/commit/eabaa2a9a83ec32b787c659c363ebfb648f03b57))
* pr comments ([d25438b](https://github.com/VenusProtocol/venus-protocol/commit/d25438bc3d4495a2fabf720ec08aebead0df4f6c))
* pr comments ([0ce6962](https://github.com/VenusProtocol/venus-protocol/commit/0ce69629170233d16184a62eaec618ea8ef3c1a5))
* PR comments ([98e4fca](https://github.com/VenusProtocol/venus-protocol/commit/98e4fcaf4fd49c247f031a25315f29b71720b1f2))
* prevent duplicate underlying asset ([7dbb4d8](https://github.com/VenusProtocol/venus-protocol/commit/7dbb4d88fa2220404769bd564949b40cef0ab76a))
* prevent irrevocable token burn and allow burn using vip ([22009c1](https://github.com/VenusProtocol/venus-protocol/commit/22009c1c53b45f4327af97805634b4a50e732741))
* prevent multiple calls to internal func and store in local var ([355b7a7](https://github.com/VenusProtocol/venus-protocol/commit/355b7a717d3c877213e5ef537cc7f957e38e4792))
* prevent oracle interface casting ([0b429fe](https://github.com/VenusProtocol/venus-protocol/commit/0b429fe5ee9d5e1bee780ebc26ee0cef357b457b))
* prevent pendingScoreUpdates corruption during minting ([dab203f](https://github.com/VenusProtocol/venus-protocol/commit/dab203f882359193b3bf5ff7f1a33fec19abd468))
* prevent resetting unclaimed interest ([f31a054](https://github.com/VenusProtocol/venus-protocol/commit/f31a0543da039dab69112c6be3e36ea54959503b))
* prevent revert if score is already updated ([b6c6736](https://github.com/VenusProtocol/venus-protocol/commit/b6c673627530cbd34b068ffb2a2b1f4c4ab87d21))
* prevent updateAssetsState from reverting ([6b81bb2](https://github.com/VenusProtocol/venus-protocol/commit/6b81bb213716ef74448e2111b90bce7656742f43))
* PTP-05 ([91b2474](https://github.com/VenusProtocol/venus-protocol/commit/91b247497b83db509e11146a71e98fcabe843ae7))
* PTP-05 ([eb36a3f](https://github.com/VenusProtocol/venus-protocol/commit/eb36a3fd43e9381e4ad2dd2e4646f84685043577))
* PTP-05 | Missing And Incomplete NatSpec Comments ([2abb751](https://github.com/VenusProtocol/venus-protocol/commit/2abb751c90ca3517141deb1d852a35ebb036070e))
* PTP-07 | missing input validation ([f7d463b](https://github.com/VenusProtocol/venus-protocol/commit/f7d463b4c9e3467aea026ce33d0f3f643ada3022))
* PVE001 ([05bcd40](https://github.com/VenusProtocol/venus-protocol/commit/05bcd400d1665ef5916d7eaca9083c44d328c99e))
* PVE002 ([3128c23](https://github.com/VenusProtocol/venus-protocol/commit/3128c231a32d03e198b47c97553e9d2f25b65ba1))
* PVE003 ([c9e0809](https://github.com/VenusProtocol/venus-protocol/commit/c9e08094760cc4b07907c079fb3a73e07c2670e7))
* PVE003-2 ([34c3ea5](https://github.com/VenusProtocol/venus-protocol/commit/34c3ea5e0bcaaa8ffae1c56c81362c67fdcaad10))
* PVE004 ([03839e5](https://github.com/VenusProtocol/venus-protocol/commit/03839e5253cd25837b1f17ffd9391a7a870fb586))
* redeployed prime ([6846f09](https://github.com/VenusProtocol/venus-protocol/commit/6846f09df2ad87cf23e7613bc251b79ab99c4741))
* redeployed prime ([26d30f6](https://github.com/VenusProtocol/venus-protocol/commit/26d30f6310dfe0a841c1205a4e024b5cb20b65e4))
* redeployed prime contracts ([425d2c7](https://github.com/VenusProtocol/venus-protocol/commit/425d2c797d8423db2202a4c5f58bb7d265ecb188))
* redeployed testnet contracts ([fc9e1bc](https://github.com/VenusProtocol/venus-protocol/commit/fc9e1bc3230af741a653b4d6f5b0e556057c82cf))
* release funds when claim has insufficient balance ([33ce30c](https://github.com/VenusProtocol/venus-protocol/commit/33ce30ccc9865b0ffb87e33b97191ed9dca410d3))
* releaseFund() for plp ([8029c8c](https://github.com/VenusProtocol/venus-protocol/commit/8029c8cacdefd52a8022017062406abb0ec3ed9e))
* remove _alphaDenominator check ([efa219a](https://github.com/VenusProtocol/venus-protocol/commit/efa219aa33811647bed0ae2ca5100648eb36eb9a))
* remove _updateRoundAfterTokenMinted ([e2f0e17](https://github.com/VenusProtocol/venus-protocol/commit/e2f0e170314fc366e0a1d60350cb0d23fc63299a))
* remove 0 assignment ([c1dddbc](https://github.com/VenusProtocol/venus-protocol/commit/c1dddbcb72e154e8dc84d63e27e039c1aaf30696))
* remove comment ([6e08d89](https://github.com/VenusProtocol/venus-protocol/commit/6e08d89daecbc0656f0eaf9fac956a9994033213))
* remove comments ([66f25fc](https://github.com/VenusProtocol/venus-protocol/commit/66f25fc7e7f543d0f59610d6ceba1fdc3b43fa21))
* remove console ([54a8ce9](https://github.com/VenusProtocol/venus-protocol/commit/54a8ce9a25aa3cd82955ee8163afe9e4734555df))
* remove error strings from tests ([e355c77](https://github.com/VenusProtocol/venus-protocol/commit/e355c770c4c3562df513512dff1f4e00a0832882))
* remove gap from PLP ([425381d](https://github.com/VenusProtocol/venus-protocol/commit/425381df43e48c0603a73b722c763dbf1d33db15))
* remove index multiplier ([64a297a](https://github.com/VenusProtocol/venus-protocol/commit/64a297a992204e3213369616e185ac9cc8fbd02f))
* remove invocation of update score on liquidate borrow verify ([b6ca5e3](https://github.com/VenusProtocol/venus-protocol/commit/b6ca5e36594d310aaccbf1f70388b4b0e4cb9ac4))
* remove prime from VTokenInterface ([3d570bc](https://github.com/VenusProtocol/venus-protocol/commit/3d570bcea2744b15a7b0f0984d6fe4ffdb23642f))
* remove PSR dependency ([aae7c6d](https://github.com/VenusProtocol/venus-protocol/commit/aae7c6d7902e6900e26b72f77a21babc718fbf20))
* remove unused errors ([ef28b34](https://github.com/VenusProtocol/venus-protocol/commit/ef28b347fbe142a432657ba1c00db76cd818dec3))
* remove unused erros ([44ec28a](https://github.com/VenusProtocol/venus-protocol/commit/44ec28a832fa276cf8f51d530c9107bdcc22d838))
* remove unused event ([ccccb30](https://github.com/VenusProtocol/venus-protocol/commit/ccccb30623a3cbe7105efd8e03a2d3db394192c7))
* remove unused import ([3f48666](https://github.com/VenusProtocol/venus-protocol/commit/3f48666ebfd1287bd4c8ca50fee7001c6da43b8d))
* remove unused interface functions ([3c3e2ee](https://github.com/VenusProtocol/venus-protocol/commit/3c3e2eef0aa99d28485ef0b288f85dc328c2fefc))
* remove unused state var ([e94a190](https://github.com/VenusProtocol/venus-protocol/commit/e94a190b220e40e572c939c680dc92e166a7acb9))
* remove unused state variable ([12bf107](https://github.com/VenusProtocol/venus-protocol/commit/12bf1070326b29bef53a4f4440c08aa7d0fd60da))
* remove unused var ([74ac28b](https://github.com/VenusProtocol/venus-protocol/commit/74ac28b38f8d981a826b518bf19679446dbd5f77))
* remove unused var comment ([17553c5](https://github.com/VenusProtocol/venus-protocol/commit/17553c584f53bc9d7e533b12fb078ba5fcbbe036))
* remove unwanted check ([e18f896](https://github.com/VenusProtocol/venus-protocol/commit/e18f896f7e62dab0152eeb912bb1cda62e1655d5))
* remove unwanted comments ([bc7d823](https://github.com/VenusProtocol/venus-protocol/commit/bc7d823848dd4c744829d74583ce0178d5f289f5))
* remove unwanted zero check ([4ce9d4c](https://github.com/VenusProtocol/venus-protocol/commit/4ce9d4cfd039e578b51235af0e67ea5022e0d7f4))
* remove unwated check ([d2e80f3](https://github.com/VenusProtocol/venus-protocol/commit/d2e80f3f24ad9baf9d1295d90225dbe7dd84c582))
* remove virtual from initializer ([1e16352](https://github.com/VenusProtocol/venus-protocol/commit/1e16352b623aa9d5d45ee9e1020067d0eef2c8dc))
* removed doc ([995799b](https://github.com/VenusProtocol/venus-protocol/commit/995799b414d634dacc77f6d5bbf6f7f820aaf4d8))
* removed getMarketDecimals ([6f4311b](https://github.com/VenusProtocol/venus-protocol/commit/6f4311b795e920e671f7dd613e7d687744454ec0))
* removed psr ([18efa60](https://github.com/VenusProtocol/venus-protocol/commit/18efa60dea0e39de23d0f9096d0486978852e62b))
* removed unchecked ([4bcc2f0](https://github.com/VenusProtocol/venus-protocol/commit/4bcc2f015c58c58f4893c494a47c507682de306a))
* removed unused function ([386929e](https://github.com/VenusProtocol/venus-protocol/commit/386929eaf158955dc219603cc21789394c19d20d))
* replace account and owner with user ([b54917c](https://github.com/VenusProtocol/venus-protocol/commit/b54917cd456eb581b017964b10e454b7803ff5ff))
* replace score with sumOfMembersScore in tests ([7e835a0](https://github.com/VenusProtocol/venus-protocol/commit/7e835a08598f6cf7ee90f8ab0f806ab4ff445375))
* replece memory with calldata ([0272882](https://github.com/VenusProtocol/venus-protocol/commit/0272882e45c277a2c4e46d1a4f14c7a38876a725))
* resolve conflict with diamond controller ([935f4cf](https://github.com/VenusProtocol/venus-protocol/commit/935f4cf80b872034be7bf30e275e27ba66dc2d5b))
* resolved conflict ([bd8e177](https://github.com/VenusProtocol/venus-protocol/commit/bd8e1778673fe5a3f55c905f71cbf13d6c63ce3b))
* resolved conflicts ([a1a59e1](https://github.com/VenusProtocol/venus-protocol/commit/a1a59e1acfc6612d1531b1e76bc8e583b7c2463f))
* resolved merge conflicts ([e7419a3](https://github.com/VenusProtocol/venus-protocol/commit/e7419a310c5b08fc98a313912c49f14d74dfa81d))
* resolved merge conflicts ([1b4fa63](https://github.com/VenusProtocol/venus-protocol/commit/1b4fa633742bfa951e05c762d114028e6130b7cd))
* revert apr calc changes ([ec2f4fd](https://github.com/VenusProtocol/venus-protocol/commit/ec2f4fdf1d6614c57af9a26a235cb6588f07056a))
* revert fix ([4120434](https://github.com/VenusProtocol/venus-protocol/commit/412043425cd6dae83e9233752769b0b164160e39))
* set default max distribution speed ([e7b7ff5](https://github.com/VenusProtocol/venus-protocol/commit/e7b7ff541dcf882525dcf215eb21eeb76cf8cc46))
* setter for prime token ([3619c58](https://github.com/VenusProtocol/venus-protocol/commit/3619c58a2079e21e48d6b5ff94a2a9517108443e))
* simplify check ([5a04aa0](https://github.com/VenusProtocol/venus-protocol/commit/5a04aa0354c3d5bbf6a91234547920c7f52a65cc))
* SPT-01 - normalise decimals ([27f8485](https://github.com/VenusProtocol/venus-protocol/commit/27f84855dc74ebdad9a144103d2db06b0db4ec76))
* SPV-01 - not allow alpha equal 1 ([64daba3](https://github.com/VenusProtocol/venus-protocol/commit/64daba3f757085585a705f685e86e468580c0eb5))
* stop accruing prime interest in comptroller ([f0df7f5](https://github.com/VenusProtocol/venus-protocol/commit/f0df7f54d3601d306b99da68e06726b4c77c8679))
* test for releaseFund ([022ac1d](https://github.com/VenusProtocol/venus-protocol/commit/022ac1d827b0f43b7eb31cc07a094c330181b8f5))
* test with custom errors ([aefb359](https://github.com/VenusProtocol/venus-protocol/commit/aefb35927d4e256968eca69db07d72468bf3dc5b))
* transfer plp ownership ([d265149](https://github.com/VenusProtocol/venus-protocol/commit/d2651494dca9ce74825110c092c98e17d3ef3015))
* transferred ownership ([0da9316](https://github.com/VenusProtocol/venus-protocol/commit/0da9316ed646e10b4b458486abe0dbd43cc8c24c))
* uncommented ([7232958](https://github.com/VenusProtocol/venus-protocol/commit/72329583ca69ab104a2fd84c44b988049b553564))
* uncommented code ([0b4883b](https://github.com/VenusProtocol/venus-protocol/commit/0b4883b1d31be3ada0101ccd7a813540acc01eca))
* update config ([9e08627](https://github.com/VenusProtocol/venus-protocol/commit/9e086271de726fee5d72cf7716f953cb47e168ab))
* update config ([6c4ca78](https://github.com/VenusProtocol/venus-protocol/commit/6c4ca785799f8516a446df32d15252100e3f2ef0))
* update config ([60654be](https://github.com/VenusProtocol/venus-protocol/commit/60654be1f350e144bfc305c3fc26efe4d1a93430))
* update config ([4dddbe2](https://github.com/VenusProtocol/venus-protocol/commit/4dddbe29ffbc2b499c66364991b70d457ba2b0ea))
* update config ([22696e1](https://github.com/VenusProtocol/venus-protocol/commit/22696e1b4a42357bb280a271eca847c0f11ed4b0))
* update score and reset user when token is burned ([0c6ddc7](https://github.com/VenusProtocol/venus-protocol/commit/0c6ddc755fcc646dd2ca51c82e6356e5e7f988ff))
* update score when borror is liquidated ([7cc8232](https://github.com/VenusProtocol/venus-protocol/commit/7cc82326e0f5e07d3997a3bec659b81d6254e29e))
* update scores for borrowed market during liquidation ([44a5411](https://github.com/VenusProtocol/venus-protocol/commit/44a54110b0993426aee3fbf30d75af0b394b2e1c))
* update stakedAt only in xvsUpdated function ([9d31816](https://github.com/VenusProtocol/venus-protocol/commit/9d318165333b5ae4d2350a4b674d7d7237066642))
* updated CI ([a2718b1](https://github.com/VenusProtocol/venus-protocol/commit/a2718b19c2cfcdbcf46aa9f62eecdf01527bc7ec))
* updated comment ([cbadb37](https://github.com/VenusProtocol/venus-protocol/commit/cbadb37ba9e444189037dded253fbd11d46994b6))
* updated schema enum ([2552b4d](https://github.com/VenusProtocol/venus-protocol/commit/2552b4db74eb3d40e387563faba477af470f5573))
* updated xvs max limit and setPrime permissions ([860c959](https://github.com/VenusProtocol/venus-protocol/commit/860c9598465b0e67092f838e3c5ee2faf7c1b664))
* updated yarn ([a9a89a1](https://github.com/VenusProtocol/venus-protocol/commit/a9a89a10984892d9805f9dd7d4c8a3752075e6d2))
* use capped amounts to calculate supply and borrow income ([2c7f65c](https://github.com/VenusProtocol/venus-protocol/commit/2c7f65c4aec8193dd9d63f77c90e2422ee52fdbb))
* use capped supply, borrow and xvs for score calculation ([9e9efe5](https://github.com/VenusProtocol/venus-protocol/commit/9e9efe50a9e04c60566f2bc7b51b304c0bcf28e3))
* use delete ([5af2748](https://github.com/VenusProtocol/venus-protocol/commit/5af27488693213cd1fc9a8659a440d33e5c5b634))
* use not equal not ([6581db1](https://github.com/VenusProtocol/venus-protocol/commit/6581db184c2245cfb590d5b74d54fd94b0ab5e64))
* use pre-decrement ([0af7678](https://github.com/VenusProtocol/venus-protocol/commit/0af7678f1e80a7fbc73a18b86a3d9f407ed7fa41))
* use pre-fix instead of post-fix ([21deff7](https://github.com/VenusProtocol/venus-protocol/commit/21deff7d6158a42abc0044639227dde884060489))
* use same values in testnet and mainnet ([8b169c3](https://github.com/VenusProtocol/venus-protocol/commit/8b169c3a31a3b5607f15573399ba12d4d473b43a))
* use uint256 instead of uint ([e9269c7](https://github.com/VenusProtocol/venus-protocol/commit/e9269c7f3da8706a29271e35155dd5f7231a33b3))
* use underlying token decimals ([f1fecac](https://github.com/VenusProtocol/venus-protocol/commit/f1fecacada4bb5d7e4b8cad5b6ca498f2d0d16be))
* use usd cap for supply and borrow ([38c7345](https://github.com/VenusProtocol/venus-protocol/commit/38c7345d03c79bd37fdd58fb595684532c66d99b))
* use usd to caps - wip ([4b68619](https://github.com/VenusProtocol/venus-protocol/commit/4b68619fac8c42befa56bff0602812df27dba878))
* validate timestamp ([a8aef0f](https://github.com/VenusProtocol/venus-protocol/commit/a8aef0f29f418aa31c570fdff417aeeda47aa436))
* ven-2016 g-06 ([5505bf7](https://github.com/VenusProtocol/venus-protocol/commit/5505bf7c2503f3228f3421b45ee749fce2c2921a))
* ven-2016 g-07 ([240f16f](https://github.com/VenusProtocol/venus-protocol/commit/240f16f6cc53fa06a6389dfbb6fa821eb2b41b04))
* ven-2016 g-15 ([e8f0ced](https://github.com/VenusProtocol/venus-protocol/commit/e8f0ced5abaabb64ff124433022574a7a63384dc))
* ven-2016 g-25 ([28e266d](https://github.com/VenusProtocol/venus-protocol/commit/28e266db4a44e2cdf305f329247ce4ed96cce5ac))
* ven-2016 g-26 ([460c794](https://github.com/VenusProtocol/venus-protocol/commit/460c794b4177b751d2e1f934c06a0f12e12f4114))
* ven-2016 g-31 ([751f1aa](https://github.com/VenusProtocol/venus-protocol/commit/751f1aa62d6d5efbc08ef69c071f2e40bf344acd))
* ven-2016 l-01 ([db5cc29](https://github.com/VenusProtocol/venus-protocol/commit/db5cc29ec7e5410c36c9431f2783e1917b897be5))
* ven-2016 l-02 ([df9e9af](https://github.com/VenusProtocol/venus-protocol/commit/df9e9af4b009bf138dfce8965f07f1c555b3686a))
* ven-2016 l-04 ([2bce045](https://github.com/VenusProtocol/venus-protocol/commit/2bce045f48d65ce0d84266c9df5ba7613ed5dc75))
* ven-2016 l-09 ([7897fa7](https://github.com/VenusProtocol/venus-protocol/commit/7897fa7042df13920c98d0e7ead0c969b22bfd46))
* ven-2016 n-04 ([7d6c63c](https://github.com/VenusProtocol/venus-protocol/commit/7d6c63ce21f7793d84b01dc622894aa91ad34685))
* ven-2016 n-09 ([4ac7e84](https://github.com/VenusProtocol/venus-protocol/commit/4ac7e849c0acc2ed9371efe6b87e40d599900d01))
* ven-2016 n-13 ([92052a2](https://github.com/VenusProtocol/venus-protocol/commit/92052a2ba53dc2ca9598a0e7ae8063b2d1b314bd))
* ven-2016 n-19 ([6523ce7](https://github.com/VenusProtocol/venus-protocol/commit/6523ce7f0a99de966eb638251721dade4662c536))
* ven-2016 n-21 ([f055f7e](https://github.com/VenusProtocol/venus-protocol/commit/f055f7e8965ec426c997a3b392483030fc94a63f))
* ven-2016 n-23 ([3cb7618](https://github.com/VenusProtocol/venus-protocol/commit/3cb76189c4ed1ff39afa04da4b7e40a58025f67d))
* ven-2016 n-27 ([2baa889](https://github.com/VenusProtocol/venus-protocol/commit/2baa88933b2e5262d1d555ff1dfe72f4237a7416))
* ven-2016 n-29 ([acfb5a7](https://github.com/VenusProtocol/venus-protocol/commit/acfb5a7f8c8a1ba5a8b3d7b469558298eca61b6f))
* ven-2016 n-31 n-32 n-34 ([027f5fe](https://github.com/VenusProtocol/venus-protocol/commit/027f5fe65ed4687b7c05cdd291d942eae628794e))
* ven-2016 n-35 ([91eb342](https://github.com/VenusProtocol/venus-protocol/commit/91eb342c4bb9420d63a39e2bd1eb02768b22fdf5))
* ven-2016 n-36 ([86e7037](https://github.com/VenusProtocol/venus-protocol/commit/86e70374a0d96a831ecd38ef91913c6157e1fdfa))
* ven-2016 n-38 for plp prime setter ([ca5aa1f](https://github.com/VenusProtocol/venus-protocol/commit/ca5aa1f4047e2021f15b29d4d3ebc37de01ebc32))
* ven-2016 n-44 ([fec60ec](https://github.com/VenusProtocol/venus-protocol/commit/fec60ec8718bb102e4a0d54904cde97fead6e9f6))
* ven-2016 n-45 ([e4cb911](https://github.com/VenusProtocol/venus-protocol/commit/e4cb911408c1c58c0a8a6cbdc0b9c503a8092a57))
* ven-2016 n-46 ([1b839df](https://github.com/VenusProtocol/venus-protocol/commit/1b839df58d0cca3d93d13eb5fa1fc347d7c24afd))
* ven-2016 n-47 ([8968822](https://github.com/VenusProtocol/venus-protocol/commit/896882215c4514f4b379ddc65759efb378b232ff))
* ven-2016 n-48 ([0d21911](https://github.com/VenusProtocol/venus-protocol/commit/0d219112c3114ebfb70457faf158a3f315cfdd84))
* ven-2016 n-49 ([06a74ab](https://github.com/VenusProtocol/venus-protocol/commit/06a74ab61f0db50bd3736854e513e0dbe934e2f0))
* ven-2016 n-52 updated oz contracts package version ([21aedde](https://github.com/VenusProtocol/venus-protocol/commit/21aeddedcdfa552c9b891c8a697a58a752919146))
* ven-2017 ([b0ff7ba](https://github.com/VenusProtocol/venus-protocol/commit/b0ff7ba0f5e304f6b88bedfc13b20d125dc026e6))
* VEN-2050 ([26fd196](https://github.com/VenusProtocol/venus-protocol/commit/26fd196485b0e91bd5486fe45a4f5c42dee5d782))
* VEN-2053 ([acaf138](https://github.com/VenusProtocol/venus-protocol/commit/acaf1387a559c25f2373be60de2dc8f84868ad75))
* VEN-2055 ([8c0fa82](https://github.com/VenusProtocol/venus-protocol/commit/8c0fa82e3a0d5e557e95b4e337b0b07316757d84))
* VPB-01 ([42c565b](https://github.com/VenusProtocol/venus-protocol/commit/42c565b52fa3a1d43f1df4d7249ddcfc6a9d83a6))
* VPB-01 ([7fbe58a](https://github.com/VenusProtocol/venus-protocol/commit/7fbe58a77cb97dc5da992ee26593701bfab54f4a))
* VPB-01 | Typos and Inconsistencies ([17d5c2a](https://github.com/VenusProtocol/venus-protocol/commit/17d5c2ad1e12b2129eda814dee95d4eb6c465e4c))
* wip-deployment ([fefb688](https://github.com/VenusProtocol/venus-protocol/commit/fefb6883d46b2b2039f010728bcff87bd9adf6d4))


### Reverts

* alpha numerator cannot be zero ([e8d8ba2](https://github.com/VenusProtocol/venus-protocol/commit/e8d8ba25bf290ff710c669882972d570953fcd48))

## [5.1.0](https://github.com/VenusProtocol/venus-protocol/compare/v5.0.0...v5.1.0) (2023-11-01)


### Features

* add BUSD liquidator contract ([ecd8a0b](https://github.com/VenusProtocol/venus-protocol/commit/ecd8a0b423d115ab78cc870c7e02e43ad2b0eee8))
* add setter for PSR ([04ea03f](https://github.com/VenusProtocol/venus-protocol/commit/04ea03f1ddc7ffb7b78207f81cb0ef622934bda8))
* add VToken version two ([6ca872d](https://github.com/VenusProtocol/venus-protocol/commit/6ca872df13dbdb8dbbb30faee46e5c48239d6aa6))
* added fork tests ([d8b1c9c](https://github.com/VenusProtocol/venus-protocol/commit/d8b1c9cee094b013c7de0442f14dfd965180006c))
* refactor storage and interface ([2bb5610](https://github.com/VenusProtocol/venus-protocol/commit/2bb56102da7e2436d80e0493371dcc960e436fc6))
* remove v2 dependency for VToken ([aa64f64](https://github.com/VenusProtocol/venus-protocol/commit/aa64f647c24288f6ef994b99c11def41bf8129e0))
* tests for VBNBAdmin ([88f5adf](https://github.com/VenusProtocol/venus-protocol/commit/88f5adfa28eea7f5a5cb9d05fc7c6718233d371e))
* vBNBAdmin contract created ([87790de](https://github.com/VenusProtocol/venus-protocol/commit/87790de8148e9369f3aa2a3964f17b9a7f766da6))
* VEN-1214 integrate ACM in vToken ([9be81a5](https://github.com/VenusProtocol/venus-protocol/commit/9be81a5345081948b83fb7dbfbfa7226c243d205))


### Bug Fixes

* [PVE-001] remove redundand approval reset ([592b022](https://github.com/VenusProtocol/venus-protocol/commit/592b022723740c6b7b066445f407f12253d85637))
* 1.1 VTokenInterfaces.sol ([e8714c8](https://github.com/VenusProtocol/venus-protocol/commit/e8714c8a98b59a6e87f153e505ecabbea6251c75))
* 1.2 VToken.sol ([6e5176c](https://github.com/VenusProtocol/venus-protocol/commit/6e5176c0832533d6253c049011bd9137f3db3df1))
* 12. [Info] Safe Math Function Not Used For Block Delta Calculation ([51bf6fd](https://github.com/VenusProtocol/venus-protocol/commit/51bf6fd75cc337d9c5716c9af4bbf667ca7914c0))
* 4. [Low] Input Validation ([7f303f5](https://github.com/VenusProtocol/venus-protocol/commit/7f303f505d8278b846565485e4668e41f7206032))
* add ReservesReduced event ([6e21a37](https://github.com/VenusProtocol/venus-protocol/commit/6e21a37b974977debe1af7889cc6cd3c0ee554bc))
* added old mainnet proxy admin ([9a5ea84](https://github.com/VenusProtocol/venus-protocol/commit/9a5ea847ac1a429515fde0c5225fe70f1abe59d8))
* BP12 ([4cd97d0](https://github.com/VenusProtocol/venus-protocol/commit/4cd97d0ee5762c36e0a8bd9e13cfae50a01b9ac5))
* certik VPB-03 Typos and Inconsistencies ([e8fdf1b](https://github.com/VenusProtocol/venus-protocol/commit/e8fdf1b580a176229cebe743d84d26ec79eeeb8b))
* certik VPB-05 ([df0c07b](https://github.com/VenusProtocol/venus-protocol/commit/df0c07bbead2b7204873ff64719a6617503bfba9))
* certik VPI-01 MISSING ZERO ADDRESS VALIDATION ([e699b13](https://github.com/VenusProtocol/venus-protocol/commit/e699b139ffe3bd2bb037b48df659811656f98a31))
* certik: VTV-02 Optimization ([0695114](https://github.com/VenusProtocol/venus-protocol/commit/0695114b8d10fcd46a3abaa76ee397b29bc63e4e))
* changed storage gap ([511d66c](https://github.com/VenusProtocol/venus-protocol/commit/511d66c6d1b3b6e85a37221c87eae467cb48c0c2))
* contract size and tests ([42ae2af](https://github.com/VenusProtocol/venus-protocol/commit/42ae2afb00b88a4de41ad0f16496665965714827))
* deployment for testnet ([a8450bc](https://github.com/VenusProtocol/venus-protocol/commit/a8450bc46c669460006287b3130f0ae55d25aadf))
* FairyProof 2.1 ([cc3231a](https://github.com/VenusProtocol/venus-protocol/commit/cc3231a729a18a1a5fa5deba4944dd956aea8b90))
* fix natspec comment ([5312427](https://github.com/VenusProtocol/venus-protocol/commit/531242717019d18408ac659f14e3fe622206371b))
* fix yarn.lock ([f832640](https://github.com/VenusProtocol/venus-protocol/commit/f832640dfbd82b2ca4adf54ef2b8aa7ebe58e0f4))
* fixed recieve due to 23000 gas limit ([0ea1ed1](https://github.com/VenusProtocol/venus-protocol/commit/0ea1ed147fb853b1d6bd4e8e92e92a7c580d5884))
* fixed tests ([65e79e5](https://github.com/VenusProtocol/venus-protocol/commit/65e79e567745fe80ddea7a982cc565cba2500a6b))
* fixed tests ([67a3ac8](https://github.com/VenusProtocol/venus-protocol/commit/67a3ac8f26eee25321bd8240f6a128a74cbb10da))
* fixed vBNBAdmin tests ([e6ea28b](https://github.com/VenusProtocol/venus-protocol/commit/e6ea28b9089c7e440e25aef61f88d349593b005e))
* get comptroller from vBNB ([43fd668](https://github.com/VenusProtocol/venus-protocol/commit/43fd6684c038a3b84fe029de349da16c822b2b4c))
* mainnet deployment ([a237adc](https://github.com/VenusProtocol/venus-protocol/commit/a237adc8b28f8c5566e873bd5313b3c1b847b25b))
* optimise gas when setting PSR ([1992f80](https://github.com/VenusProtocol/venus-protocol/commit/1992f805e6abe10fc957f357ab5d0192460e86d4))
* PVE001 ([a575a70](https://github.com/VenusProtocol/venus-protocol/commit/a575a70d954948d223ec879f5962cb8c188c4b55))
* redeploy with correct PSR and Admin proxy ([86677d4](https://github.com/VenusProtocol/venus-protocol/commit/86677d47a0bfc458f72e1797c54a79eac6ee981f))
* redeployed contracts ([831222d](https://github.com/VenusProtocol/venus-protocol/commit/831222da535a7e0dd91d371236b92cae148a8fee))
* redeployed mainnet contracts ([a1aaa20](https://github.com/VenusProtocol/venus-protocol/commit/a1aaa2059ce32c9078c9b01bdac301fbe0522b80))
* redeployed mainnet contracts ([8039d2c](https://github.com/VenusProtocol/venus-protocol/commit/8039d2c148a1de161deb68368427182ba806587d))
* remove @nomiclabs/hardhat-ethers ([8a27466](https://github.com/VenusProtocol/venus-protocol/commit/8a27466629a8fbac7f5dbac253b04ebbf4585b63))
* remove acceptVBNBAdmin ([b11d297](https://github.com/VenusProtocol/venus-protocol/commit/b11d2972dbbf9855a7560f26745fae783bc15e7e))
* remove ownable init ([9bd845f](https://github.com/VenusProtocol/venus-protocol/commit/9bd845fb70711893d7fce2f440d8d58f2848cc76))
* remove Ownable2StepUpgradeable ([7f54165](https://github.com/VenusProtocol/venus-protocol/commit/7f54165c950d0162112f93386596f16a8a403a6d))
* remove unwanted import ([8e63e9a](https://github.com/VenusProtocol/venus-protocol/commit/8e63e9a126e4a29071c4bbb4a0d5274227d0a892))
* removed console.log ([8b55821](https://github.com/VenusProtocol/venus-protocol/commit/8b55821bc99267e8da8d60eb3eff55f1af44cc95))
* require statement ([3629618](https://github.com/VenusProtocol/venus-protocol/commit/3629618d750f220cc915d99bf72faa4ab395de0e))
* resolve comments ([ca4d1da](https://github.com/VenusProtocol/venus-protocol/commit/ca4d1dadb27dc1f20010303b3493a5984547b1a0))
* resolved conflict ([cac6b1c](https://github.com/VenusProtocol/venus-protocol/commit/cac6b1cd9fe82d348fd8af85a93512dd120f0457))
* revert config changes ([9e223f1](https://github.com/VenusProtocol/venus-protocol/commit/9e223f131a86e40f8f8725239f8c2f942d050022))
* revert mainnet url ([4e4dcbc](https://github.com/VenusProtocol/venus-protocol/commit/4e4dcbc23a68404e4d684c8047aa31d01d20f803))
* tests ([d24f9f6](https://github.com/VenusProtocol/venus-protocol/commit/d24f9f6c444c1bddab18515dc671e5853f556869))
* trigger ci ([df315ff](https://github.com/VenusProtocol/venus-protocol/commit/df315ff05fc5305da6bf3b166c42aa1f0ce472f2))
* updated proxy address ([dacce20](https://github.com/VenusProtocol/venus-protocol/commit/dacce2009280bc4989fd1c8d5069115e4407843a))
* use factory for ACM in tests ([1d1f690](https://github.com/VenusProtocol/venus-protocol/commit/1d1f6903912a3d9f446220879f63c62977618808))
* use onlyowner ([52f8efd](https://github.com/VenusProtocol/venus-protocol/commit/52f8efd6a9aeb7280e68e47efe983be41993e1d7))
* VBB-01 ([bc6fd4e](https://github.com/VenusProtocol/venus-protocol/commit/bc6fd4e27232562a80265e4575418e4c5fb8536f))
* VBN-02 ([04d5e1c](https://github.com/VenusProtocol/venus-protocol/commit/04d5e1c252801e14a7f056f554b556e2abcd5e63))
* VPI-01 ([c2656c6](https://github.com/VenusProtocol/venus-protocol/commit/c2656c6f0b43a457366d64a4ea364044ed6f8e47))


### Reverts

* Revert "refactor: use function instead of modifier" ([ea216cd](https://github.com/VenusProtocol/venus-protocol/commit/ea216cdf7ee1a0ac1f015b5b088c37098e2d9a96))

## [5.1.0-dev.4](https://github.com/VenusProtocol/venus-protocol/compare/v5.1.0-dev.3...v5.1.0-dev.4) (2023-10-31)


### Features

* add VToken version two ([6ca872d](https://github.com/VenusProtocol/venus-protocol/commit/6ca872df13dbdb8dbbb30faee46e5c48239d6aa6))
* refactor storage and interface ([2bb5610](https://github.com/VenusProtocol/venus-protocol/commit/2bb56102da7e2436d80e0493371dcc960e436fc6))
* remove v2 dependency for VToken ([aa64f64](https://github.com/VenusProtocol/venus-protocol/commit/aa64f647c24288f6ef994b99c11def41bf8129e0))
* VEN-1214 integrate ACM in vToken ([9be81a5](https://github.com/VenusProtocol/venus-protocol/commit/9be81a5345081948b83fb7dbfbfa7226c243d205))


### Bug Fixes

* 1.1 VTokenInterfaces.sol ([e8714c8](https://github.com/VenusProtocol/venus-protocol/commit/e8714c8a98b59a6e87f153e505ecabbea6251c75))
* 1.2 VToken.sol ([6e5176c](https://github.com/VenusProtocol/venus-protocol/commit/6e5176c0832533d6253c049011bd9137f3db3df1))
* 12. [Info] Safe Math Function Not Used For Block Delta Calculation ([51bf6fd](https://github.com/VenusProtocol/venus-protocol/commit/51bf6fd75cc337d9c5716c9af4bbf667ca7914c0))
* 4. [Low] Input Validation ([7f303f5](https://github.com/VenusProtocol/venus-protocol/commit/7f303f505d8278b846565485e4668e41f7206032))
* BP12 ([4cd97d0](https://github.com/VenusProtocol/venus-protocol/commit/4cd97d0ee5762c36e0a8bd9e13cfae50a01b9ac5))
* certik VPB-03 Typos and Inconsistencies ([e8fdf1b](https://github.com/VenusProtocol/venus-protocol/commit/e8fdf1b580a176229cebe743d84d26ec79eeeb8b))
* certik VPB-05 ([df0c07b](https://github.com/VenusProtocol/venus-protocol/commit/df0c07bbead2b7204873ff64719a6617503bfba9))
* certik VPI-01 MISSING ZERO ADDRESS VALIDATION ([e699b13](https://github.com/VenusProtocol/venus-protocol/commit/e699b139ffe3bd2bb037b48df659811656f98a31))
* certik: VTV-02 Optimization ([0695114](https://github.com/VenusProtocol/venus-protocol/commit/0695114b8d10fcd46a3abaa76ee397b29bc63e4e))
* contract size and tests ([42ae2af](https://github.com/VenusProtocol/venus-protocol/commit/42ae2afb00b88a4de41ad0f16496665965714827))
* FairyProof 2.1 ([cc3231a](https://github.com/VenusProtocol/venus-protocol/commit/cc3231a729a18a1a5fa5deba4944dd956aea8b90))
* fix natspec comment ([5312427](https://github.com/VenusProtocol/venus-protocol/commit/531242717019d18408ac659f14e3fe622206371b))
* fixed vBNBAdmin tests ([e6ea28b](https://github.com/VenusProtocol/venus-protocol/commit/e6ea28b9089c7e440e25aef61f88d349593b005e))
* PVE001 ([a575a70](https://github.com/VenusProtocol/venus-protocol/commit/a575a70d954948d223ec879f5962cb8c188c4b55))
* require statement ([3629618](https://github.com/VenusProtocol/venus-protocol/commit/3629618d750f220cc915d99bf72faa4ab395de0e))
* resolve comments ([ca4d1da](https://github.com/VenusProtocol/venus-protocol/commit/ca4d1dadb27dc1f20010303b3493a5984547b1a0))
* tests ([d24f9f6](https://github.com/VenusProtocol/venus-protocol/commit/d24f9f6c444c1bddab18515dc671e5853f556869))

## [5.1.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v5.1.0-dev.2...v5.1.0-dev.3) (2023-10-24)


### Features

* add BUSD liquidator contract ([ecd8a0b](https://github.com/VenusProtocol/venus-protocol/commit/ecd8a0b423d115ab78cc870c7e02e43ad2b0eee8))


### Bug Fixes

* [PVE-001] remove redundand approval reset ([592b022](https://github.com/VenusProtocol/venus-protocol/commit/592b022723740c6b7b066445f407f12253d85637))
* use factory for ACM in tests ([1d1f690](https://github.com/VenusProtocol/venus-protocol/commit/1d1f6903912a3d9f446220879f63c62977618808))

## [5.1.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v5.1.0-dev.1...v5.1.0-dev.2) (2023-10-24)

## [5.1.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v5.0.1-dev.1...v5.1.0-dev.1) (2023-10-20)


### Features

* add setter for PSR ([04ea03f](https://github.com/VenusProtocol/venus-protocol/commit/04ea03f1ddc7ffb7b78207f81cb0ef622934bda8))
* added fork tests ([d8b1c9c](https://github.com/VenusProtocol/venus-protocol/commit/d8b1c9cee094b013c7de0442f14dfd965180006c))
* tests for VBNBAdmin ([88f5adf](https://github.com/VenusProtocol/venus-protocol/commit/88f5adfa28eea7f5a5cb9d05fc7c6718233d371e))
* vBNBAdmin contract created ([87790de](https://github.com/VenusProtocol/venus-protocol/commit/87790de8148e9369f3aa2a3964f17b9a7f766da6))


### Bug Fixes

* add ReservesReduced event ([6e21a37](https://github.com/VenusProtocol/venus-protocol/commit/6e21a37b974977debe1af7889cc6cd3c0ee554bc))
* added old mainnet proxy admin ([9a5ea84](https://github.com/VenusProtocol/venus-protocol/commit/9a5ea847ac1a429515fde0c5225fe70f1abe59d8))
* changed storage gap ([511d66c](https://github.com/VenusProtocol/venus-protocol/commit/511d66c6d1b3b6e85a37221c87eae467cb48c0c2))
* deployment for testnet ([a8450bc](https://github.com/VenusProtocol/venus-protocol/commit/a8450bc46c669460006287b3130f0ae55d25aadf))
* fix yarn.lock ([f832640](https://github.com/VenusProtocol/venus-protocol/commit/f832640dfbd82b2ca4adf54ef2b8aa7ebe58e0f4))
* fixed recieve due to 23000 gas limit ([0ea1ed1](https://github.com/VenusProtocol/venus-protocol/commit/0ea1ed147fb853b1d6bd4e8e92e92a7c580d5884))
* fixed tests ([65e79e5](https://github.com/VenusProtocol/venus-protocol/commit/65e79e567745fe80ddea7a982cc565cba2500a6b))
* fixed tests ([67a3ac8](https://github.com/VenusProtocol/venus-protocol/commit/67a3ac8f26eee25321bd8240f6a128a74cbb10da))
* get comptroller from vBNB ([43fd668](https://github.com/VenusProtocol/venus-protocol/commit/43fd6684c038a3b84fe029de349da16c822b2b4c))
* mainnet deployment ([a237adc](https://github.com/VenusProtocol/venus-protocol/commit/a237adc8b28f8c5566e873bd5313b3c1b847b25b))
* optimise gas when setting PSR ([1992f80](https://github.com/VenusProtocol/venus-protocol/commit/1992f805e6abe10fc957f357ab5d0192460e86d4))
* redeploy with correct PSR and Admin proxy ([86677d4](https://github.com/VenusProtocol/venus-protocol/commit/86677d47a0bfc458f72e1797c54a79eac6ee981f))
* redeployed contracts ([831222d](https://github.com/VenusProtocol/venus-protocol/commit/831222da535a7e0dd91d371236b92cae148a8fee))
* redeployed mainnet contracts ([a1aaa20](https://github.com/VenusProtocol/venus-protocol/commit/a1aaa2059ce32c9078c9b01bdac301fbe0522b80))
* redeployed mainnet contracts ([8039d2c](https://github.com/VenusProtocol/venus-protocol/commit/8039d2c148a1de161deb68368427182ba806587d))
* remove @nomiclabs/hardhat-ethers ([8a27466](https://github.com/VenusProtocol/venus-protocol/commit/8a27466629a8fbac7f5dbac253b04ebbf4585b63))
* remove acceptVBNBAdmin ([b11d297](https://github.com/VenusProtocol/venus-protocol/commit/b11d2972dbbf9855a7560f26745fae783bc15e7e))
* remove ownable init ([9bd845f](https://github.com/VenusProtocol/venus-protocol/commit/9bd845fb70711893d7fce2f440d8d58f2848cc76))
* remove Ownable2StepUpgradeable ([7f54165](https://github.com/VenusProtocol/venus-protocol/commit/7f54165c950d0162112f93386596f16a8a403a6d))
* remove unwanted import ([8e63e9a](https://github.com/VenusProtocol/venus-protocol/commit/8e63e9a126e4a29071c4bbb4a0d5274227d0a892))
* removed console.log ([8b55821](https://github.com/VenusProtocol/venus-protocol/commit/8b55821bc99267e8da8d60eb3eff55f1af44cc95))
* resolved conflict ([cac6b1c](https://github.com/VenusProtocol/venus-protocol/commit/cac6b1cd9fe82d348fd8af85a93512dd120f0457))
* revert config changes ([9e223f1](https://github.com/VenusProtocol/venus-protocol/commit/9e223f131a86e40f8f8725239f8c2f942d050022))
* revert mainnet url ([4e4dcbc](https://github.com/VenusProtocol/venus-protocol/commit/4e4dcbc23a68404e4d684c8047aa31d01d20f803))
* trigger ci ([df315ff](https://github.com/VenusProtocol/venus-protocol/commit/df315ff05fc5305da6bf3b166c42aa1f0ce472f2))
* updated proxy address ([dacce20](https://github.com/VenusProtocol/venus-protocol/commit/dacce2009280bc4989fd1c8d5069115e4407843a))
* use onlyowner ([52f8efd](https://github.com/VenusProtocol/venus-protocol/commit/52f8efd6a9aeb7280e68e47efe983be41993e1d7))
* VBB-01 ([bc6fd4e](https://github.com/VenusProtocol/venus-protocol/commit/bc6fd4e27232562a80265e4575418e4c5fb8536f))
* VBN-02 ([04d5e1c](https://github.com/VenusProtocol/venus-protocol/commit/04d5e1c252801e14a7f056f554b556e2abcd5e63))
* VPI-01 ([c2656c6](https://github.com/VenusProtocol/venus-protocol/commit/c2656c6f0b43a457366d64a4ea364044ed6f8e47))

## [5.0.1-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v5.0.0...v5.0.1-dev.1) (2023-10-19)

## [5.0.0](https://github.com/VenusProtocol/venus-protocol/compare/v4.0.0...v5.0.0) (2023-10-19)


### ⚠ BREAKING CHANGES

* remove Governance receipt and governance proposal function and structure

### Features

* add contract with the consolidated interface of the Comptroller Diamond ([41f6725](https://github.com/VenusProtocol/venus-protocol/commit/41f6725459168c58aa53a92e16822d9d37835af8))
* add mainnet deployment of venus lens ([e4f0f50](https://github.com/VenusProtocol/venus-protocol/commit/e4f0f5015aaa55d0be428acd6cbfabc21b02f789))
* remove governance contracts VEN-1719 ([55640a1](https://github.com/VenusProtocol/venus-protocol/commit/55640a1303f697dea33b516684d8889f16f439e7))
* remove Governance receipt and governance proposal function and structure ([ff884bd](https://github.com/VenusProtocol/venus-protocol/commit/ff884bdd3ddf15a0188b2b7ce8702e3e36786adf))
* updated venus lens deployment ([bfd09b2](https://github.com/VenusProtocol/venus-protocol/commit/bfd09b2a0b938b97fa87784283dbd39eee12e131))


### Bug Fixes

* lint ([3f6017d](https://github.com/VenusProtocol/venus-protocol/commit/3f6017d36ae084d20a03c8d1d1d7c9966c30ef34))
* tests ([8b80a34](https://github.com/VenusProtocol/venus-protocol/commit/8b80a34e7f0950b6adf6dc8ee173860942df4081))
* venus lens ([7c8f046](https://github.com/VenusProtocol/venus-protocol/commit/7c8f046a36c047f2de2996a696919161f1c1348f))

## [5.0.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v4.1.0-dev.2...v5.0.0-dev.1) (2023-10-18)


### ⚠ BREAKING CHANGES

* remove Governance receipt and governance proposal function and structure

### Features

* add mainnet deployment of venus lens ([e4f0f50](https://github.com/VenusProtocol/venus-protocol/commit/e4f0f5015aaa55d0be428acd6cbfabc21b02f789))
* remove governance contracts VEN-1719 ([55640a1](https://github.com/VenusProtocol/venus-protocol/commit/55640a1303f697dea33b516684d8889f16f439e7))
* remove Governance receipt and governance proposal function and structure ([ff884bd](https://github.com/VenusProtocol/venus-protocol/commit/ff884bdd3ddf15a0188b2b7ce8702e3e36786adf))
* updated venus lens deployment ([bfd09b2](https://github.com/VenusProtocol/venus-protocol/commit/bfd09b2a0b938b97fa87784283dbd39eee12e131))


### Bug Fixes

* lint ([3f6017d](https://github.com/VenusProtocol/venus-protocol/commit/3f6017d36ae084d20a03c8d1d1d7c9966c30ef34))
* tests ([8b80a34](https://github.com/VenusProtocol/venus-protocol/commit/8b80a34e7f0950b6adf6dc8ee173860942df4081))
* venus lens ([7c8f046](https://github.com/VenusProtocol/venus-protocol/commit/7c8f046a36c047f2de2996a696919161f1c1348f))

## [4.1.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v4.1.0-dev.1...v4.1.0-dev.2) (2023-10-10)

## [4.1.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v4.0.0...v4.1.0-dev.1) (2023-10-09)


### Features

* add contract with the consolidated interface of the Comptroller Diamond ([41f6725](https://github.com/VenusProtocol/venus-protocol/commit/41f6725459168c58aa53a92e16822d9d37835af8))

## [4.0.0](https://github.com/VenusProtocol/venus-protocol/compare/v3.1.0...v4.0.0) (2023-09-25)


### ⚠ BREAKING CHANGES

* Removal of comptroller.sol

### Features

* diamond proxy implementation of comptroller ([66f90f4](https://github.com/VenusProtocol/venus-protocol/commit/66f90f4564e73993b7885c4bbd15c8d9d7d74437))
* force liquidation implementation ([cf9c7cb](https://github.com/VenusProtocol/venus-protocol/commit/cf9c7cb74519ae8fc8c99add9997f63087ac2f96))
* ven-1619 3.4 added view methods for facets states ([d12981f](https://github.com/VenusProtocol/venus-protocol/commit/d12981f2cbb3962d170d0348ede45a07457419b5))


### Bug Fixes

* comptroller diamond test for script ([a87f3e7](https://github.com/VenusProtocol/venus-protocol/commit/a87f3e7aaa86cc29cadf86af971a1b137004cc17))
* diamond layout test ([3adf806](https://github.com/VenusProtocol/venus-protocol/commit/3adf8064a8d07c993cb7dbeba427c684288bc943))
* docgen issue ([a46b205](https://github.com/VenusProtocol/venus-protocol/commit/a46b20594e86d09e73f9049205ed8cec57f39896))
* enter markets return empty array ([c57d257](https://github.com/VenusProtocol/venus-protocol/commit/c57d257e081823d153421467b323b3a385943e49))
* gas-01 ([e762a5d](https://github.com/VenusProtocol/venus-protocol/commit/e762a5d7f83f378a041053a2b9f4b8e68b72d8be))
* gas-02 ([b3503c2](https://github.com/VenusProtocol/venus-protocol/commit/b3503c2cf5dcd9e3997c7ad9695eda8390ad550e))
* gas-06 ([0aea270](https://github.com/VenusProtocol/venus-protocol/commit/0aea270798c1dc7e74293c8de9adc02f2bbb2cf9))
* lint ([a34816a](https://github.com/VenusProtocol/venus-protocol/commit/a34816aedbd76aa3c6ee113e5d8fa8413124c941))
* lint ([d09d8d3](https://github.com/VenusProtocol/venus-protocol/commit/d09d8d37d7892609120403806b188be7b36f7d66))
* lint errors. ([22e3887](https://github.com/VenusProtocol/venus-protocol/commit/22e3887988c0475a83d499898994a96f7b086a26))
* lint fix ([a41278c](https://github.com/VenusProtocol/venus-protocol/commit/a41278cbd7ede42f382e5f2bfb8632e0ac7df1ca))
* lint fix ([0f31c2a](https://github.com/VenusProtocol/venus-protocol/commit/0f31c2abaee04d9eab1bcd0bc0878afdd0c4ff1a))
* lint issues. ([b234a2f](https://github.com/VenusProtocol/venus-protocol/commit/b234a2fe9162ce656a3eb4bb8eca35ea23691dcb))
* merge branch 'develop' into feat/diamond-proxy ([e6e9ca5](https://github.com/VenusProtocol/venus-protocol/commit/e6e9ca5c1c6a016cce06fd15835798c6beb9dc13))
* minor issues. ([5601101](https://github.com/VenusProtocol/venus-protocol/commit/56011013738d9ae5f924cb72f28fa016eb2c5ad1))
* moved diamond's facets script ([a1d991f](https://github.com/VenusProtocol/venus-protocol/commit/a1d991f909800df6505b9b451d4ca0e291c1ba9f))
* no of optimizer runs ([c9417cf](https://github.com/VenusProtocol/venus-protocol/commit/c9417cf68dca51ec11868b7aef69435c650a71d3))
* pr comments ([0710b66](https://github.com/VenusProtocol/venus-protocol/commit/0710b66e4e51fc5170eeacd08164b4fb90ab2381))
* pr comments ([35b5517](https://github.com/VenusProtocol/venus-protocol/commit/35b5517efac7618203782cfb6ff4f4dc0a8e0345))
* pr comments ([68ef09b](https://github.com/VenusProtocol/venus-protocol/commit/68ef09b6792c90d85d908f0428c79305165fd09d))
* pr comments, undo unwanted changes ([53a4dec](https://github.com/VenusProtocol/venus-protocol/commit/53a4dec8c9eac735959eb1d8e4c8f9f8205e2b5b))
* pr comments, used external instead of public ([5cdaa26](https://github.com/VenusProtocol/venus-protocol/commit/5cdaa2632cf88e98986231cf01bc97e8f0ce11a8))
* removed unwanted checks from setTreasuryData ([6982bc5](https://github.com/VenusProtocol/venus-protocol/commit/6982bc5b621b7b59cbc46796e925aa3bf9b54718))
* replaced And operator with OR while checking cutoff ([fa26e52](https://github.com/VenusProtocol/venus-protocol/commit/fa26e52206ef47ea59728f90da9cb409149f574a))
* resolve issues in script files ([2a634fb](https://github.com/VenusProtocol/venus-protocol/commit/2a634fba8fa4d1ef76d1f1197da436772b54eeea))
* resolve merge conflicts ([e3621e3](https://github.com/VenusProtocol/venus-protocol/commit/e3621e397ff2e5d1b0099f2486d783ab24dcd34b))
* resolved conflicts ([1f1b0f9](https://github.com/VenusProtocol/venus-protocol/commit/1f1b0f9f09654e8fbb0fa5d522852e7dc7a1ac8b))
* resolved conflicts ([b4ddc09](https://github.com/VenusProtocol/venus-protocol/commit/b4ddc09dd38eb3eebd650ede4db6b9d984b046c5))
* resolved conflicts, merged latest develop ([295609e](https://github.com/VenusProtocol/venus-protocol/commit/295609e440286ffc04ec9ca7c0ff9f60885bed39))
* resolved merge conflicts with develop branch ([249eaee](https://github.com/VenusProtocol/venus-protocol/commit/249eaee4f84dbfe3bc7a9d0fc58dcaa3a69f4b0d))
* script for unitrollerAddress empty ([1f8263e](https://github.com/VenusProtocol/venus-protocol/commit/1f8263ed005f66d5326da03e7b864736f2eb1db7))
* script owner rights and facet calls ([7b2eeeb](https://github.com/VenusProtocol/venus-protocol/commit/7b2eeeb5a382d9c87ea6de0d12405adb9e05d9e9))
* updated yarn.lock ([032cc8e](https://github.com/VenusProtocol/venus-protocol/commit/032cc8e227207932d7159d3437b7502229cff1e4))
* ven-1619 1.1 unnecessary immutable function ([9ef6b75](https://github.com/VenusProtocol/venus-protocol/commit/9ef6b75b0bcd1198d89043d35ab6d51c7af8e141))
* ven-1619 2.1 added missing methods ([b5f701f](https://github.com/VenusProtocol/venus-protocol/commit/b5f701f47397866fc068fd3107aa44c05267e131))
* ven-1619 2.2, 2.3 moved MarketEntered event ([0225801](https://github.com/VenusProtocol/venus-protocol/commit/022580156da867e6f0e15f33da5b2bda332670f4))
* ven-1619 3.1 re-entrancy check in claimVenus ([8f5eeb5](https://github.com/VenusProtocol/venus-protocol/commit/8f5eeb5ec7492342144c6cda7df079821cb0bb45))
* ven-1619 3.3 shadowed variables in _setActionsPaused ([c256072](https://github.com/VenusProtocol/venus-protocol/commit/c2560727fd688e6c18ec80a3a5a3587a56b42b30))
* ven-1630 check for market not as collateral ([05ff797](https://github.com/VenusProtocol/venus-protocol/commit/05ff7979ea182867dea39c104a3e09a8d60c3401))
* VEN-1686 ([94bc2e4](https://github.com/VenusProtocol/venus-protocol/commit/94bc2e414e33ebf6c05d35c1605dcbd48fa932f5))
* ven-1699 n1 ([4598d00](https://github.com/VenusProtocol/venus-protocol/commit/4598d0082f6fb5cd76c0c3a10f8062a01b5a15b9))
* ven-1699 n2 ([13c0a92](https://github.com/VenusProtocol/venus-protocol/commit/13c0a929948bb36e8a64d041ba58f26d5893101f))
* ven-1699 pve001 ([f285dd1](https://github.com/VenusProtocol/venus-protocol/commit/f285dd133d422de7289be384cb4cc888c655f107))
* ven-1699 pve002 ([b5ef58e](https://github.com/VenusProtocol/venus-protocol/commit/b5ef58e71e0a3e99146b8062a89074daaa6cd048))
* ven-1757 vai-01 unnecesary remnant casting ([53a08eb](https://github.com/VenusProtocol/venus-protocol/commit/53a08eb7b0d2ad567842660d76a5a7dc9a0d8a34))
* ven-1759 ddc-04 ([7417d8f](https://github.com/VenusProtocol/venus-protocol/commit/7417d8f4b17eb156dd44a8b4d8eb6dbf3e6e4015))
* ven-1759 ddc-04 diamond loupe methods ([c797f14](https://github.com/VenusProtocol/venus-protocol/commit/c797f14e8fba2aed8de3bb917a0721f6ec3080ae))
* ven-1795 l-02 ([cfaa69a](https://github.com/VenusProtocol/venus-protocol/commit/cfaa69aea6ef1d55c7fc4e457780ca83cd58add1))
* ven-1795 l-06 ([0aa7e17](https://github.com/VenusProtocol/venus-protocol/commit/0aa7e177fd47cbcb2c22fd8ea66a304ee7692868))
* ven-1795 n-01 n-03 n-09 ([6d0a33c](https://github.com/VenusProtocol/venus-protocol/commit/6d0a33c3087701593b1470cace558baedaa3e6d1))
* ven-1795 n-02 ([50761a0](https://github.com/VenusProtocol/venus-protocol/commit/50761a0573b019e6f59269f4ef45821dae955523))
* ven-1795 n-04 ([0387b34](https://github.com/VenusProtocol/venus-protocol/commit/0387b3415d86d1c4bcb278ab9f3b9f5e9de0d854))
* ven-1795 n-05 ([5533343](https://github.com/VenusProtocol/venus-protocol/commit/553334311197cce028da3031fe8ce2b281f6898e))
* ven-1795 n-06 ([847afd7](https://github.com/VenusProtocol/venus-protocol/commit/847afd7f04dd3961eee11b359f0fc5502ea6fd50))
* ven-1795 n-07 ([4596c2b](https://github.com/VenusProtocol/venus-protocol/commit/4596c2b7693d16a08ae6b1c3f8a5c39240cd33d7))
* ven-1795 n-08 ([b0f39a1](https://github.com/VenusProtocol/venus-protocol/commit/b0f39a178720d36a570d28b1f8e6aea838dd4fea))
* ven-1795 n-10 ([4c72e43](https://github.com/VenusProtocol/venus-protocol/commit/4c72e43e1e1264f274c9d5507a690366bb12af18))
* ven-1795 test for n-08 ([4c72287](https://github.com/VenusProtocol/venus-protocol/commit/4c72287e635fa387e966647ebc445a17e2ab3892))
* ven-1887 ven-04 ([c60497a](https://github.com/VenusProtocol/venus-protocol/commit/c60497ab220cb483b75df242ffd4fe08439a438e))
* ven-1887 ven-08 ([b745623](https://github.com/VenusProtocol/venus-protocol/commit/b745623f6bb95b978b8bd3c62fac6fcff5ac277d))


### Reverts

* Revert "[VEN-1887]: Quantstamp audit fix for comptroller diamond proxy (#328)" (#337) ([9af2d4a](https://github.com/VenusProtocol/venus-protocol/commit/9af2d4ab1159770c76c50292e7d53025b06c47a3)), closes [#328](https://github.com/VenusProtocol/venus-protocol/issues/328) [#337](https://github.com/VenusProtocol/venus-protocol/issues/337)
* ven-1795 changes for n-08 ([fd07edd](https://github.com/VenusProtocol/venus-protocol/commit/fd07edd871d4f1199e6676910351b6d2f8c5a760))

## [4.0.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v3.1.0...v4.0.0-dev.1) (2023-09-25)


### ⚠ BREAKING CHANGES

* Removal of comptroller.sol

### Features

* diamond proxy implementation of comptroller ([66f90f4](https://github.com/VenusProtocol/venus-protocol/commit/66f90f4564e73993b7885c4bbd15c8d9d7d74437))
* force liquidation implementation ([cf9c7cb](https://github.com/VenusProtocol/venus-protocol/commit/cf9c7cb74519ae8fc8c99add9997f63087ac2f96))
* ven-1619 3.4 added view methods for facets states ([d12981f](https://github.com/VenusProtocol/venus-protocol/commit/d12981f2cbb3962d170d0348ede45a07457419b5))


### Bug Fixes

* comptroller diamond test for script ([a87f3e7](https://github.com/VenusProtocol/venus-protocol/commit/a87f3e7aaa86cc29cadf86af971a1b137004cc17))
* diamond layout test ([3adf806](https://github.com/VenusProtocol/venus-protocol/commit/3adf8064a8d07c993cb7dbeba427c684288bc943))
* docgen issue ([a46b205](https://github.com/VenusProtocol/venus-protocol/commit/a46b20594e86d09e73f9049205ed8cec57f39896))
* enter markets return empty array ([c57d257](https://github.com/VenusProtocol/venus-protocol/commit/c57d257e081823d153421467b323b3a385943e49))
* gas-01 ([e762a5d](https://github.com/VenusProtocol/venus-protocol/commit/e762a5d7f83f378a041053a2b9f4b8e68b72d8be))
* gas-02 ([b3503c2](https://github.com/VenusProtocol/venus-protocol/commit/b3503c2cf5dcd9e3997c7ad9695eda8390ad550e))
* gas-06 ([0aea270](https://github.com/VenusProtocol/venus-protocol/commit/0aea270798c1dc7e74293c8de9adc02f2bbb2cf9))
* lint ([a34816a](https://github.com/VenusProtocol/venus-protocol/commit/a34816aedbd76aa3c6ee113e5d8fa8413124c941))
* lint ([d09d8d3](https://github.com/VenusProtocol/venus-protocol/commit/d09d8d37d7892609120403806b188be7b36f7d66))
* lint errors. ([22e3887](https://github.com/VenusProtocol/venus-protocol/commit/22e3887988c0475a83d499898994a96f7b086a26))
* lint fix ([a41278c](https://github.com/VenusProtocol/venus-protocol/commit/a41278cbd7ede42f382e5f2bfb8632e0ac7df1ca))
* lint fix ([0f31c2a](https://github.com/VenusProtocol/venus-protocol/commit/0f31c2abaee04d9eab1bcd0bc0878afdd0c4ff1a))
* lint issues. ([b234a2f](https://github.com/VenusProtocol/venus-protocol/commit/b234a2fe9162ce656a3eb4bb8eca35ea23691dcb))
* merge branch 'develop' into feat/diamond-proxy ([e6e9ca5](https://github.com/VenusProtocol/venus-protocol/commit/e6e9ca5c1c6a016cce06fd15835798c6beb9dc13))
* minor issues. ([5601101](https://github.com/VenusProtocol/venus-protocol/commit/56011013738d9ae5f924cb72f28fa016eb2c5ad1))
* moved diamond's facets script ([a1d991f](https://github.com/VenusProtocol/venus-protocol/commit/a1d991f909800df6505b9b451d4ca0e291c1ba9f))
* no of optimizer runs ([c9417cf](https://github.com/VenusProtocol/venus-protocol/commit/c9417cf68dca51ec11868b7aef69435c650a71d3))
* pr comments ([0710b66](https://github.com/VenusProtocol/venus-protocol/commit/0710b66e4e51fc5170eeacd08164b4fb90ab2381))
* pr comments ([35b5517](https://github.com/VenusProtocol/venus-protocol/commit/35b5517efac7618203782cfb6ff4f4dc0a8e0345))
* pr comments ([68ef09b](https://github.com/VenusProtocol/venus-protocol/commit/68ef09b6792c90d85d908f0428c79305165fd09d))
* pr comments, undo unwanted changes ([53a4dec](https://github.com/VenusProtocol/venus-protocol/commit/53a4dec8c9eac735959eb1d8e4c8f9f8205e2b5b))
* pr comments, used external instead of public ([5cdaa26](https://github.com/VenusProtocol/venus-protocol/commit/5cdaa2632cf88e98986231cf01bc97e8f0ce11a8))
* removed unwanted checks from setTreasuryData ([6982bc5](https://github.com/VenusProtocol/venus-protocol/commit/6982bc5b621b7b59cbc46796e925aa3bf9b54718))
* replaced And operator with OR while checking cutoff ([fa26e52](https://github.com/VenusProtocol/venus-protocol/commit/fa26e52206ef47ea59728f90da9cb409149f574a))
* resolve issues in script files ([2a634fb](https://github.com/VenusProtocol/venus-protocol/commit/2a634fba8fa4d1ef76d1f1197da436772b54eeea))
* resolve merge conflicts ([e3621e3](https://github.com/VenusProtocol/venus-protocol/commit/e3621e397ff2e5d1b0099f2486d783ab24dcd34b))
* resolved conflicts ([1f1b0f9](https://github.com/VenusProtocol/venus-protocol/commit/1f1b0f9f09654e8fbb0fa5d522852e7dc7a1ac8b))
* resolved conflicts ([b4ddc09](https://github.com/VenusProtocol/venus-protocol/commit/b4ddc09dd38eb3eebd650ede4db6b9d984b046c5))
* resolved conflicts, merged latest develop ([295609e](https://github.com/VenusProtocol/venus-protocol/commit/295609e440286ffc04ec9ca7c0ff9f60885bed39))
* resolved merge conflicts with develop branch ([249eaee](https://github.com/VenusProtocol/venus-protocol/commit/249eaee4f84dbfe3bc7a9d0fc58dcaa3a69f4b0d))
* script for unitrollerAddress empty ([1f8263e](https://github.com/VenusProtocol/venus-protocol/commit/1f8263ed005f66d5326da03e7b864736f2eb1db7))
* script owner rights and facet calls ([7b2eeeb](https://github.com/VenusProtocol/venus-protocol/commit/7b2eeeb5a382d9c87ea6de0d12405adb9e05d9e9))
* updated yarn.lock ([032cc8e](https://github.com/VenusProtocol/venus-protocol/commit/032cc8e227207932d7159d3437b7502229cff1e4))
* ven-1619 1.1 unnecessary immutable function ([9ef6b75](https://github.com/VenusProtocol/venus-protocol/commit/9ef6b75b0bcd1198d89043d35ab6d51c7af8e141))
* ven-1619 2.1 added missing methods ([b5f701f](https://github.com/VenusProtocol/venus-protocol/commit/b5f701f47397866fc068fd3107aa44c05267e131))
* ven-1619 2.2, 2.3 moved MarketEntered event ([0225801](https://github.com/VenusProtocol/venus-protocol/commit/022580156da867e6f0e15f33da5b2bda332670f4))
* ven-1619 3.1 re-entrancy check in claimVenus ([8f5eeb5](https://github.com/VenusProtocol/venus-protocol/commit/8f5eeb5ec7492342144c6cda7df079821cb0bb45))
* ven-1619 3.3 shadowed variables in _setActionsPaused ([c256072](https://github.com/VenusProtocol/venus-protocol/commit/c2560727fd688e6c18ec80a3a5a3587a56b42b30))
* ven-1630 check for market not as collateral ([05ff797](https://github.com/VenusProtocol/venus-protocol/commit/05ff7979ea182867dea39c104a3e09a8d60c3401))
* VEN-1686 ([94bc2e4](https://github.com/VenusProtocol/venus-protocol/commit/94bc2e414e33ebf6c05d35c1605dcbd48fa932f5))
* ven-1699 n1 ([4598d00](https://github.com/VenusProtocol/venus-protocol/commit/4598d0082f6fb5cd76c0c3a10f8062a01b5a15b9))
* ven-1699 n2 ([13c0a92](https://github.com/VenusProtocol/venus-protocol/commit/13c0a929948bb36e8a64d041ba58f26d5893101f))
* ven-1699 pve001 ([f285dd1](https://github.com/VenusProtocol/venus-protocol/commit/f285dd133d422de7289be384cb4cc888c655f107))
* ven-1699 pve002 ([b5ef58e](https://github.com/VenusProtocol/venus-protocol/commit/b5ef58e71e0a3e99146b8062a89074daaa6cd048))
* ven-1757 vai-01 unnecesary remnant casting ([53a08eb](https://github.com/VenusProtocol/venus-protocol/commit/53a08eb7b0d2ad567842660d76a5a7dc9a0d8a34))
* ven-1759 ddc-04 ([7417d8f](https://github.com/VenusProtocol/venus-protocol/commit/7417d8f4b17eb156dd44a8b4d8eb6dbf3e6e4015))
* ven-1759 ddc-04 diamond loupe methods ([c797f14](https://github.com/VenusProtocol/venus-protocol/commit/c797f14e8fba2aed8de3bb917a0721f6ec3080ae))
* ven-1795 l-02 ([cfaa69a](https://github.com/VenusProtocol/venus-protocol/commit/cfaa69aea6ef1d55c7fc4e457780ca83cd58add1))
* ven-1795 l-06 ([0aa7e17](https://github.com/VenusProtocol/venus-protocol/commit/0aa7e177fd47cbcb2c22fd8ea66a304ee7692868))
* ven-1795 n-01 n-03 n-09 ([6d0a33c](https://github.com/VenusProtocol/venus-protocol/commit/6d0a33c3087701593b1470cace558baedaa3e6d1))
* ven-1795 n-02 ([50761a0](https://github.com/VenusProtocol/venus-protocol/commit/50761a0573b019e6f59269f4ef45821dae955523))
* ven-1795 n-04 ([0387b34](https://github.com/VenusProtocol/venus-protocol/commit/0387b3415d86d1c4bcb278ab9f3b9f5e9de0d854))
* ven-1795 n-05 ([5533343](https://github.com/VenusProtocol/venus-protocol/commit/553334311197cce028da3031fe8ce2b281f6898e))
* ven-1795 n-06 ([847afd7](https://github.com/VenusProtocol/venus-protocol/commit/847afd7f04dd3961eee11b359f0fc5502ea6fd50))
* ven-1795 n-07 ([4596c2b](https://github.com/VenusProtocol/venus-protocol/commit/4596c2b7693d16a08ae6b1c3f8a5c39240cd33d7))
* ven-1795 n-08 ([b0f39a1](https://github.com/VenusProtocol/venus-protocol/commit/b0f39a178720d36a570d28b1f8e6aea838dd4fea))
* ven-1795 n-10 ([4c72e43](https://github.com/VenusProtocol/venus-protocol/commit/4c72e43e1e1264f274c9d5507a690366bb12af18))
* ven-1795 test for n-08 ([4c72287](https://github.com/VenusProtocol/venus-protocol/commit/4c72287e635fa387e966647ebc445a17e2ab3892))
* ven-1887 ven-04 ([c60497a](https://github.com/VenusProtocol/venus-protocol/commit/c60497ab220cb483b75df242ffd4fe08439a438e))
* ven-1887 ven-08 ([b745623](https://github.com/VenusProtocol/venus-protocol/commit/b745623f6bb95b978b8bd3c62fac6fcff5ac277d))


### Reverts

* Revert "[VEN-1887]: Quantstamp audit fix for comptroller diamond proxy (#328)" (#337) ([9af2d4a](https://github.com/VenusProtocol/venus-protocol/commit/9af2d4ab1159770c76c50292e7d53025b06c47a3)), closes [#328](https://github.com/VenusProtocol/venus-protocol/issues/328) [#337](https://github.com/VenusProtocol/venus-protocol/issues/337)
* ven-1795 changes for n-08 ([fd07edd](https://github.com/VenusProtocol/venus-protocol/commit/fd07edd871d4f1199e6676910351b6d2f8c5a760))

## [3.1.0](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0...v3.1.0) (2023-09-22)


### Features

* implement forced liqudations and optimize aggressively ([71afed8](https://github.com/VenusProtocol/venus-protocol/commit/71afed80aa291d277c4a9e93cae779fdc1fe965f))

## [3.1.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v3.1.0-dev.1...v3.1.0-dev.2) (2023-09-20)

## [3.1.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0...v3.1.0-dev.1) (2023-09-18)


### Features

* implement forced liqudations and optimize aggressively ([71afed8](https://github.com/VenusProtocol/venus-protocol/commit/71afed80aa291d277c4a9e93cae779fdc1fe965f))

## [3.0.0](https://github.com/VenusProtocol/venus-protocol/compare/v2.2.1...v3.0.0) (2023-09-07)


### ⚠ BREAKING CHANGES

* [XVSVault-1] remove burnAdmin and getAdmin
* [VAIVault-7] remove getAdmin
* [VAIVault-5] remove setNewAdmin
* [VAIVault-2] remove burnAdmin

### Features

* [VAIVault-2] remove burnAdmin ([cc46efa](https://github.com/VenusProtocol/venus-protocol/commit/cc46efac3e06db507c49ba891b76851dfd69f7c3))
* [VAIVault-5] remove setNewAdmin ([c2779f0](https://github.com/VenusProtocol/venus-protocol/commit/c2779f0c87b9da7bf7f62f09026f93a3e49c78a7))
* [VAIVault-7] remove getAdmin ([3551342](https://github.com/VenusProtocol/venus-protocol/commit/3551342205ce0752452fd0437e7dba1c0ea74c31))
* [XVSVault-1] remove burnAdmin and getAdmin ([734201b](https://github.com/VenusProtocol/venus-protocol/commit/734201b06e1655f9a0ba36760d16823659db7bd8))
* add fork syntactic sugar and replace QUICKNODE Key with whole URI in env ([a106b6e](https://github.com/VenusProtocol/venus-protocol/commit/a106b6e212bf8c604d086fd848d2e0f484ae8728))
* add fork tests for PSM ([c693c55](https://github.com/VenusProtocol/venus-protocol/commit/c693c55cd7e75ccf3f452c8e4bfa62161976f9da))
* add new addresses for WBETH and (new) TUSD markets ([c4ee1bf](https://github.com/VenusProtocol/venus-protocol/commit/c4ee1bfdc7d7c912c1db93685fb5f76c1bbea5fa))
* add total supply to mint and redeem events ([a094294](https://github.com/VenusProtocol/venus-protocol/commit/a09429400035edf609b4d3544705ac7450afc1ad))
* added deployment script for swap router ([2f0c278](https://github.com/VenusProtocol/venus-protocol/commit/2f0c2783a7847879d7e54fb180c4bde0b29c1e03))
* handle insufficient rewards case ([78c9731](https://github.com/VenusProtocol/venus-protocol/commit/78c97315c0850b9fe429e8475a66642ab04f2f4b))


### Bug Fixes

* [QS-12] fix pending reward computation in XVSVault ([8d547ac](https://github.com/VenusProtocol/venus-protocol/commit/8d547ac656c33618125733e00d4ae237a16b82be))
* [QS-19] validate addresses in XVSVault ([9048e50](https://github.com/VenusProtocol/venus-protocol/commit/9048e507043aac4c488220401da1bfb61434a449))
* [QS-2] use safe96 to compute voting power ([1be65cc](https://github.com/VenusProtocol/venus-protocol/commit/1be65cc5362ee7717fb2eddacf761becb754d382))
* [QS-3] update voting power based on staked token ([bad686c](https://github.com/VenusProtocol/venus-protocol/commit/bad686c0ebd7c24e6f13cd7115a521c2a436bed2))
* [QS-4][QS-25] restrict setting lastAccruingBlock ([b0a896c](https://github.com/VenusProtocol/venus-protocol/commit/b0a896c88bef287c6a58e1fe51aa63e8cb4f2dab))
* [QS-5][QS-6] update pending reward upon user interactions ([49db8b4](https://github.com/VenusProtocol/venus-protocol/commit/49db8b4151768ec3fb76c429386f0e544572ee03))
* [QS-7][QS-8] disable initializer in XVSVault ([c02ccb8](https://github.com/VenusProtocol/venus-protocol/commit/c02ccb8e0bad620ede890c9bf411f98d2c2e8e75))
* [VAIVault-1] disallow re-configuring token addresses in VAIVault ([53d1156](https://github.com/VenusProtocol/venus-protocol/commit/53d11560f8a836b999b76405f3842757ebb6fb82))
* [XVSVault-2] disallow adding two pools with the same staked token ([4404d27](https://github.com/VenusProtocol/venus-protocol/commit/4404d27c57d40bea97320a86437ba662e26b85ec))
* [XVSVault-4.1] check that reward token is configured in XVSStore ([8e715b2](https://github.com/VenusProtocol/venus-protocol/commit/8e715b26da6e6f5e6075ca8686f78ae92de5af21))
* add a missing param to SwapRouter deployment script ([e5a47e8](https://github.com/VenusProtocol/venus-protocol/commit/e5a47e80d788264b6a5c5e60c3e9b7cfb40c14c4))
* correct testnet VenusLens address ([ba24b14](https://github.com/VenusProtocol/venus-protocol/commit/ba24b143015c2b93abe706f2ca3395f42e673985))
* escape notice when rendering page template ([643f0c2](https://github.com/VenusProtocol/venus-protocol/commit/643f0c219379dd94cb3c8bc1a131520006914919))
* fix fork tests ([4ab4c68](https://github.com/VenusProtocol/venus-protocol/commit/4ab4c685af0022daeee76bccbcea1749d12338ad))
* forbid zero alloc points in XVSVault ([43a77f3](https://github.com/VenusProtocol/venus-protocol/commit/43a77f346a8cda5cc03e985ef66a1dd569f67e0f))
* i01 license identifier not provided ([8b08294](https://github.com/VenusProtocol/venus-protocol/commit/8b08294d68a580b15690e62bb801526818d880ab))
* i02 floating pragma ([9120a0d](https://github.com/VenusProtocol/venus-protocol/commit/9120a0d589c3b90c55fc1722d2df80795db9b4bc))
* i03 public function that should be external ([27d5402](https://github.com/VenusProtocol/venus-protocol/commit/27d5402d0f33952f4fcbac5600258e7018f42d20))
* l-01 missing docstring ([394d1a7](https://github.com/VenusProtocol/venus-protocol/commit/394d1a7837fd0b6b3c950430d5fc89f3620336f3))
* l-02 locked bnb in contract ([7a8044a](https://github.com/VenusProtocol/venus-protocol/commit/7a8044ae4b5beb5c5f36eef011bc72a541030a43))
* l01 missing zero address validation ([6c4dbb2](https://github.com/VenusProtocol/venus-protocol/commit/6c4dbb24c45083a44fdcf80fd2b5cba4edff242d))
* lint issues ([b125ad7](https://github.com/VenusProtocol/venus-protocol/commit/b125ad7ca997e88682f35763709bfdafea64c1b8))
* n-01 misleading docstrings ([20e3118](https://github.com/VenusProtocol/venus-protocol/commit/20e31185312ec43432d272478e306c6776f43eae))
* n-02 naming can be improved ([027835e](https://github.com/VenusProtocol/venus-protocol/commit/027835ed915357901652c21051c10a175bc1e1ac))
* n-03 some convenience functions are missing ([cf6b8cb](https://github.com/VenusProtocol/venus-protocol/commit/cf6b8cb0735cf0ded3435161c6ea2e2d6c4b48e4))
* n-03 some convenience functions are missing ([fb66414](https://github.com/VenusProtocol/venus-protocol/commit/fb66414dd6d0a3af2436dc0220b901989ee4652a))
* n-04 confusing use of eth and bnb in ([dbf855c](https://github.com/VenusProtocol/venus-protocol/commit/dbf855c37db2e24f25f2fb19505d3f30799c8e5d))
* n-04 confusing use of eth and bnb in ([bbe298f](https://github.com/VenusProtocol/venus-protocol/commit/bbe298f71e48a53af7bf028c3de5d6761c257cdc))
* pr comments ([9751c85](https://github.com/VenusProtocol/venus-protocol/commit/9751c85d7054485d5f082aa4ba48c7ce878d9a34))
* remove the word Error from error message ([41e8623](https://github.com/VenusProtocol/venus-protocol/commit/41e86237965a19757d7c568bbe78cdccd57904f6))
* update imports of package files ([9806697](https://github.com/VenusProtocol/venus-protocol/commit/9806697bc4d42dd9f4beb71b72e467b78dac36a5))
* use hardhat 2.16.1 ([c5c0df2](https://github.com/VenusProtocol/venus-protocol/commit/c5c0df2175fcac8a9a7ed6bb16e245f16ab84b84))
* use node 18 ([0eecc46](https://github.com/VenusProtocol/venus-protocol/commit/0eecc468d126558c1c68631be67b816daa48fadf))
* VPB-02 | Comparison to Boolean Constant ([1a47e51](https://github.com/VenusProtocol/venus-protocol/commit/1a47e51eae5cf2180b0034f61159cf1fa412e37f))
* VPB-05 | Missing Upper Bound ([a158f8c](https://github.com/VenusProtocol/venus-protocol/commit/a158f8c335d0cfad71f1d2c27af6b0d92f4abe41))
* VRT-03 | Unused Event ([df23556](https://github.com/VenusProtocol/venus-protocol/commit/df23556727d2b5f13326e6deffcec7637270f642))
* VRT-05 | Typo ([6b7b8b7](https://github.com/VenusProtocol/venus-protocol/commit/6b7b8b71f9a93613b11ff881cf5a52ff8ef6931b))


### Performance Improvements

* [XVSVault-4.2] pay out pending only if the amount is nonzero ([31dc837](https://github.com/VenusProtocol/venus-protocol/commit/31dc837fa59fb25976c6f861f8a8513422eca319))

## [3.0.0-dev.19](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.18...v3.0.0-dev.19) (2023-09-04)


### Features

* add semantic release to main ([7f28dc0](https://github.com/VenusProtocol/venus-protocol/commit/7f28dc0d705e9339ad27472c6e9ebd3e88a3e4a5))


### Bug Fixes

* remove duplicate import ([e220aec](https://github.com/VenusProtocol/venus-protocol/commit/e220aec2090af60aaeee778f58b70f13fe9b5ba7))
* remove exports from package.json ([1192698](https://github.com/VenusProtocol/venus-protocol/commit/11926980735f0bb613f4dff0df4424dcdda5a6b3))
* set path for hardhat-ethers ([28795b1](https://github.com/VenusProtocol/venus-protocol/commit/28795b1001119a85ac9a0f5ae303945c8c3ba66f))
* update dependencies ([36b6e76](https://github.com/VenusProtocol/venus-protocol/commit/36b6e76ee022360f7421156ca9d0e4423215f4c5))
* update the network files with the currently used addresses ([4eaa8ae](https://github.com/VenusProtocol/venus-protocol/commit/4eaa8aef5e6a3ece21e2116073efb4c6bf1c26d5))

## [3.0.0-dev.18](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.17...v3.0.0-dev.18) (2023-08-23)


### Bug Fixes

* add a missing param to SwapRouter deployment script ([e5a47e8](https://github.com/VenusProtocol/venus-protocol/commit/e5a47e80d788264b6a5c5e60c3e9b7cfb40c14c4))

## [3.0.0-dev.17](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.16...v3.0.0-dev.17) (2023-08-22)


### Bug Fixes

* correct testnet VenusLens address ([ba24b14](https://github.com/VenusProtocol/venus-protocol/commit/ba24b143015c2b93abe706f2ca3395f42e673985))

## [3.0.0-dev.16](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.15...v3.0.0-dev.16) (2023-08-09)

## [3.0.0-dev.15](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.14...v3.0.0-dev.15) (2023-08-08)

## [3.0.0-dev.14](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.13...v3.0.0-dev.14) (2023-08-01)


### Features

* add fork syntactic sugar and replace QUICKNODE Key with whole URI in env ([a106b6e](https://github.com/VenusProtocol/venus-protocol/commit/a106b6e212bf8c604d086fd848d2e0f484ae8728))
* add fork tests for PSM ([c693c55](https://github.com/VenusProtocol/venus-protocol/commit/c693c55cd7e75ccf3f452c8e4bfa62161976f9da))


### Bug Fixes

* fix fork tests ([4ab4c68](https://github.com/VenusProtocol/venus-protocol/commit/4ab4c685af0022daeee76bccbcea1749d12338ad))

## [3.0.0-dev.13](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.12...v3.0.0-dev.13) (2023-07-12)


### Bug Fixes

* use hardhat 2.16.1 ([c5c0df2](https://github.com/VenusProtocol/venus-protocol/commit/c5c0df2175fcac8a9a7ed6bb16e245f16ab84b84))
* use node 18 ([0eecc46](https://github.com/VenusProtocol/venus-protocol/commit/0eecc468d126558c1c68631be67b816daa48fadf))

## [3.0.0-dev.12](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.11...v3.0.0-dev.12) (2023-07-07)

## [3.0.0-dev.11](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.10...v3.0.0-dev.11) (2023-06-28)

## [3.0.0-dev.10](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.9...v3.0.0-dev.10) (2023-06-27)

## [3.0.0-dev.9](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.8...v3.0.0-dev.9) (2023-06-23)


### Features

* add new addresses for WBETH and (new) TUSD markets ([c4ee1bf](https://github.com/VenusProtocol/venus-protocol/commit/c4ee1bfdc7d7c912c1db93685fb5f76c1bbea5fa))
* added deployment script for swap router ([2f0c278](https://github.com/VenusProtocol/venus-protocol/commit/2f0c2783a7847879d7e54fb180c4bde0b29c1e03))


### Bug Fixes

* l-01 missing docstring ([394d1a7](https://github.com/VenusProtocol/venus-protocol/commit/394d1a7837fd0b6b3c950430d5fc89f3620336f3))
* l-02 locked bnb in contract ([7a8044a](https://github.com/VenusProtocol/venus-protocol/commit/7a8044ae4b5beb5c5f36eef011bc72a541030a43))
* n-01 misleading docstrings ([20e3118](https://github.com/VenusProtocol/venus-protocol/commit/20e31185312ec43432d272478e306c6776f43eae))
* n-02 naming can be improved ([027835e](https://github.com/VenusProtocol/venus-protocol/commit/027835ed915357901652c21051c10a175bc1e1ac))
* n-03 some convenience functions are missing ([cf6b8cb](https://github.com/VenusProtocol/venus-protocol/commit/cf6b8cb0735cf0ded3435161c6ea2e2d6c4b48e4))
* n-03 some convenience functions are missing ([fb66414](https://github.com/VenusProtocol/venus-protocol/commit/fb66414dd6d0a3af2436dc0220b901989ee4652a))
* n-04 confusing use of eth and bnb in ([dbf855c](https://github.com/VenusProtocol/venus-protocol/commit/dbf855c37db2e24f25f2fb19505d3f30799c8e5d))
* n-04 confusing use of eth and bnb in ([bbe298f](https://github.com/VenusProtocol/venus-protocol/commit/bbe298f71e48a53af7bf028c3de5d6761c257cdc))
* pr comments ([9751c85](https://github.com/VenusProtocol/venus-protocol/commit/9751c85d7054485d5f082aa4ba48c7ce878d9a34))

## [3.0.0-dev.8](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.7...v3.0.0-dev.8) (2023-06-19)


### Bug Fixes

* VPB-02 | Comparison to Boolean Constant ([1a47e51](https://github.com/VenusProtocol/venus-protocol/commit/1a47e51eae5cf2180b0034f61159cf1fa412e37f))
* VPB-05 | Missing Upper Bound ([a158f8c](https://github.com/VenusProtocol/venus-protocol/commit/a158f8c335d0cfad71f1d2c27af6b0d92f4abe41))
* VRT-03 | Unused Event ([df23556](https://github.com/VenusProtocol/venus-protocol/commit/df23556727d2b5f13326e6deffcec7637270f642))
* VRT-05 | Typo ([6b7b8b7](https://github.com/VenusProtocol/venus-protocol/commit/6b7b8b71f9a93613b11ff881cf5a52ff8ef6931b))

## [3.0.0-dev.7](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.6...v3.0.0-dev.7) (2023-06-16)


### Features

* add total supply to mint and redeem events ([a094294](https://github.com/VenusProtocol/venus-protocol/commit/a09429400035edf609b4d3544705ac7450afc1ad))

## [3.0.0-dev.6](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.5...v3.0.0-dev.6) (2023-06-15)

## [3.0.0-dev.5](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.4...v3.0.0-dev.5) (2023-06-13)


### Bug Fixes

* escape notice when rendering page template ([643f0c2](https://github.com/VenusProtocol/venus-protocol/commit/643f0c219379dd94cb3c8bc1a131520006914919))

## [3.0.0-dev.4](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.3...v3.0.0-dev.4) (2023-06-07)


### Bug Fixes

* forbid zero alloc points in XVSVault ([43a77f3](https://github.com/VenusProtocol/venus-protocol/commit/43a77f346a8cda5cc03e985ef66a1dd569f67e0f))
* i01 license identifier not provided ([8b08294](https://github.com/VenusProtocol/venus-protocol/commit/8b08294d68a580b15690e62bb801526818d880ab))
* i02 floating pragma ([9120a0d](https://github.com/VenusProtocol/venus-protocol/commit/9120a0d589c3b90c55fc1722d2df80795db9b4bc))
* i03 public function that should be external ([27d5402](https://github.com/VenusProtocol/venus-protocol/commit/27d5402d0f33952f4fcbac5600258e7018f42d20))
* l01 missing zero address validation ([6c4dbb2](https://github.com/VenusProtocol/venus-protocol/commit/6c4dbb24c45083a44fdcf80fd2b5cba4edff242d))
* lint issues ([b125ad7](https://github.com/VenusProtocol/venus-protocol/commit/b125ad7ca997e88682f35763709bfdafea64c1b8))

## [3.0.0-dev.3](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.2...v3.0.0-dev.3) (2023-06-01)


### Features

* handle insufficient rewards case ([78c9731](https://github.com/VenusProtocol/venus-protocol/commit/78c97315c0850b9fe429e8475a66642ab04f2f4b))

## [3.0.0-dev.2](https://github.com/VenusProtocol/venus-protocol/compare/v3.0.0-dev.1...v3.0.0-dev.2) (2023-05-26)


### Bug Fixes

* [QS-12] fix pending reward computation in XVSVault ([8d547ac](https://github.com/VenusProtocol/venus-protocol/commit/8d547ac656c33618125733e00d4ae237a16b82be))
* [QS-19] validate addresses in XVSVault ([9048e50](https://github.com/VenusProtocol/venus-protocol/commit/9048e507043aac4c488220401da1bfb61434a449))
* [QS-2] use safe96 to compute voting power ([1be65cc](https://github.com/VenusProtocol/venus-protocol/commit/1be65cc5362ee7717fb2eddacf761becb754d382))
* [QS-3] update voting power based on staked token ([bad686c](https://github.com/VenusProtocol/venus-protocol/commit/bad686c0ebd7c24e6f13cd7115a521c2a436bed2))
* [QS-4][QS-25] restrict setting lastAccruingBlock ([b0a896c](https://github.com/VenusProtocol/venus-protocol/commit/b0a896c88bef287c6a58e1fe51aa63e8cb4f2dab))
* [QS-5][QS-6] update pending reward upon user interactions ([49db8b4](https://github.com/VenusProtocol/venus-protocol/commit/49db8b4151768ec3fb76c429386f0e544572ee03))
* [QS-7][QS-8] disable initializer in XVSVault ([c02ccb8](https://github.com/VenusProtocol/venus-protocol/commit/c02ccb8e0bad620ede890c9bf411f98d2c2e8e75))

## [3.0.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v2.1.0-dev.1...v3.0.0-dev.1) (2023-05-25)


### ⚠ BREAKING CHANGES

* [XVSVault-1] remove burnAdmin and getAdmin
* [VAIVault-7] remove getAdmin
* [VAIVault-5] remove setNewAdmin
* [VAIVault-2] remove burnAdmin

### Features

* [VAIVault-2] remove burnAdmin ([cc46efa](https://github.com/VenusProtocol/venus-protocol/commit/cc46efac3e06db507c49ba891b76851dfd69f7c3))
* [VAIVault-5] remove setNewAdmin ([c2779f0](https://github.com/VenusProtocol/venus-protocol/commit/c2779f0c87b9da7bf7f62f09026f93a3e49c78a7))
* [VAIVault-7] remove getAdmin ([3551342](https://github.com/VenusProtocol/venus-protocol/commit/3551342205ce0752452fd0437e7dba1c0ea74c31))
* [XVSVault-1] remove burnAdmin and getAdmin ([734201b](https://github.com/VenusProtocol/venus-protocol/commit/734201b06e1655f9a0ba36760d16823659db7bd8))


### Bug Fixes

* [VAIVault-1] disallow re-configuring token addresses in VAIVault ([53d1156](https://github.com/VenusProtocol/venus-protocol/commit/53d11560f8a836b999b76405f3842757ebb6fb82))
* [XVSVault-2] disallow adding two pools with the same staked token ([4404d27](https://github.com/VenusProtocol/venus-protocol/commit/4404d27c57d40bea97320a86437ba662e26b85ec))
* [XVSVault-4.1] check that reward token is configured in XVSStore ([8e715b2](https://github.com/VenusProtocol/venus-protocol/commit/8e715b26da6e6f5e6075ca8686f78ae92de5af21))
* remove the word Error from error message ([41e8623](https://github.com/VenusProtocol/venus-protocol/commit/41e86237965a19757d7c568bbe78cdccd57904f6))


### Performance Improvements

* [XVSVault-4.2] pay out pending only if the amount is nonzero ([31dc837](https://github.com/VenusProtocol/venus-protocol/commit/31dc837fa59fb25976c6f861f8a8513422eca319))

## [2.1.0-dev.1](https://github.com/VenusProtocol/venus-protocol/compare/v2.0.1...v2.1.0-dev.1) (2023-05-12)


### Features

* add access control to interest params ([66d65fe](https://github.com/VenusProtocol/venus-protocol/commit/66d65feb8afd3fc42685be39009822098f72b124))
* add ACM in xvsVault ([d571d1c](https://github.com/VenusProtocol/venus-protocol/commit/d571d1c44f6f9410465de07c623c4dfd69490bd8))
* add delegate borrowing feature ([ce70a96](https://github.com/VenusProtocol/venus-protocol/commit/ce70a965b1c090d1692ef20a5ccfac6f53138a68))
* add deploy script for lens contracts ([cd80912](https://github.com/VenusProtocol/venus-protocol/commit/cd8091273432bb921328104049de4f0005d81b2a))
* add governance simulation framework ([57a909d](https://github.com/VenusProtocol/venus-protocol/commit/57a909d033fc981582f55b9c183f55e57d531d4a))
* add missing addresses for the markets in main net ([5c8f5ba](https://github.com/VenusProtocol/venus-protocol/commit/5c8f5ba36e5d2af9a6a48bf750f92cd1a7664641))
* add pause unpause and access control ([a615acf](https://github.com/VenusProtocol/venus-protocol/commit/a615acf923cd35873247d4b4ae628f0e884a6e00))
* add restrictions and allowlist to liquidations ([a3e5a39](https://github.com/VenusProtocol/venus-protocol/commit/a3e5a3938138913f7c4ec9cf5983b1ccec495e90))
* add semantic release ([25ba010](https://github.com/VenusProtocol/venus-protocol/commit/25ba01055aeea0d03a8fcd715b9fb0777defb5e1))
* add v5 Access Control Manager ([f33e0d9](https://github.com/VenusProtocol/venus-protocol/commit/f33e0d931f9233a68ae9472720be9aebd7ed97b8))
* adjust GovernorBravo test cases according to vault change ([66642b6](https://github.com/VenusProtocol/venus-protocol/commit/66642b6bbf86a143d3fa9414ba3b9ba063ce22ee))
* customize docgen ([698b2bb](https://github.com/VenusProtocol/venus-protocol/commit/698b2bb5f5361e3516f5ae676c23aaf7bcff088c))
* integrate ACM in VRTVault ([f8ba903](https://github.com/VenusProtocol/venus-protocol/commit/f8ba90395ffbfdb232896d3b7b2c98660c06f9c3))
* make Liquidator upgradeable ([44c1f5a](https://github.com/VenusProtocol/venus-protocol/commit/44c1f5a49b0180bd1832b57c5bcec9c35745aca5))
* remove setDelegateForBNBHacker ([59318f6](https://github.com/VenusProtocol/venus-protocol/commit/59318f6b6a87455129c6f1982132cc01580d70d3))
* support custom proposers ([a71e338](https://github.com/VenusProtocol/venus-protocol/commit/a71e33852f5c873840dfa303e272c816237f4352))
* support governance routes ([0f713ff](https://github.com/VenusProtocol/venus-protocol/commit/0f713ff29c8a3613615fb28db743c483d7d7a9b5))
* upgrade Liquidator Solidity version ([9788625](https://github.com/VenusProtocol/venus-protocol/commit/9788625958d282a27c20878fdebc5a665f70df84))


### Bug Fixes

* :shirt: ([ab2f2aa](https://github.com/VenusProtocol/venus-protocol/commit/ab2f2aa9e39f0b01d505c33c323cb44a314fd353))
* [VEN-1227] Remove borrowInternal(uint) from the VToken contract ([56df3b7](https://github.com/VenusProtocol/venus-protocol/commit/56df3b7a8fc5ba92d6cc96367606713ff70070b4))
* add storage gap in VRT vault ([4504000](https://github.com/VenusProtocol/venus-protocol/commit/450400071227ea20cd9a25001613fda31d43eec7))
* add vTokenBorrowed to the emitted event ([99a5099](https://github.com/VenusProtocol/venus-protocol/commit/99a50999a16fd4333924fafd0e810b30e8567fe3))
* avoid unnecessary multiplications ([711d775](https://github.com/VenusProtocol/venus-protocol/commit/711d775728e66a14f3fcbba340b4e30be4803f23))
* increase optimizer runs ([65d19e7](https://github.com/VenusProtocol/venus-protocol/commit/65d19e7dcb14fb4820dd837471236097229cd5ef))
* last address of path. ([926dc07](https://github.com/VenusProtocol/venus-protocol/commit/926dc0709215cfac3d73ac5a4ad1750d6d568f6d))
* lint issues and minor fix ([01f2bda](https://github.com/VenusProtocol/venus-protocol/commit/01f2bda0843f30aa091773fa0aa8655e9775e9aa))
* minor fix ([182cd43](https://github.com/VenusProtocol/venus-protocol/commit/182cd43f438eb30d1062f0e8b72920ddb9e7b63f))
* minor fixes ([5670041](https://github.com/VenusProtocol/venus-protocol/commit/567004169fc6a99cb8140e6ba78f6e9bf8daf500))
* mionor ([807f1ec](https://github.com/VenusProtocol/venus-protocol/commit/807f1ecf2c1a14134e713346626086ad1bf4568d))
* mutiple swap + deflationary token support + swapExactTokensForTokens ([9437a22](https://github.com/VenusProtocol/venus-protocol/commit/9437a223d4f5f127c51a01ebc5b1049a75d5597d))
* PEV-001 fix claim logic in deposit ([b4ea715](https://github.com/VenusProtocol/venus-protocol/commit/b4ea715c949e3941470f470dcb5643bac0e8f589))
* PLS-01 "change the fee percent to 0.25% in pancakeLibrary" ([e8c3676](https://github.com/VenusProtocol/venus-protocol/commit/e8c36766f0b6065a751c0e62383487d9ba49874f))
* PLS-02 added indiviual checks for reserveIn and reserveOut to be 0 ([774eed1](https://github.com/VenusProtocol/venus-protocol/commit/774eed1266561fb63951617e750c2d3cad370524))
* PLS-03 removed redundant checking of reserves in pancakeLibrary ([0714741](https://github.com/VenusProtocol/venus-protocol/commit/071474188855749eaa8a852835b19af1347e072d))
* pr comments ([346d32e](https://github.com/VenusProtocol/venus-protocol/commit/346d32e59b64e7224302c6104f7c338fc7e38e60))
* PR comments. ([6ef9faf](https://github.com/VenusProtocol/venus-protocol/commit/6ef9faf8fc19a066c7e4a7dac440a9bd25f2a1cc))
* PR comments. ([7e0d572](https://github.com/VenusProtocol/venus-protocol/commit/7e0d572778b51fbd246174bd16cbf5d1788306f8))
* prevent VAI from compiling with 0.8 ([7723ee3](https://github.com/VenusProtocol/venus-protocol/commit/7723ee3dd5c24102bedadd96a0fb86be82bad5c7))
* PVE-001 claim fix in vrt ([369cf3f](https://github.com/VenusProtocol/venus-protocol/commit/369cf3fb74ec90566d0c0df642e620cc062e7bd8))
* PVE-002 improve sanity checks ([b62f302](https://github.com/VenusProtocol/venus-protocol/commit/b62f30285497edbe113ef98a33052e86f2f2183c))
* PVE-003 fix floating pragmas ([672b9de](https://github.com/VenusProtocol/venus-protocol/commit/672b9de69da25c11f9f8e33091495c2b708af583))
* Reentrancy issue. ([22cfee1](https://github.com/VenusProtocol/venus-protocol/commit/22cfee15d473c6c0cf9d0638f4e0641a309aefc5))
* remove unwanted comments and fix the version of pragmas ([5e88387](https://github.com/VenusProtocol/venus-protocol/commit/5e88387d4a47d2c396960d9b16ab22cf19be13ad))
* RHS-01 use TransferHelper Library safeTransfer to send WBNB in RouterHelper contract ([9e7103e](https://github.com/VenusProtocol/venus-protocol/commit/9e7103e6e1c4b58e0a8d2eb0d598368912a279f7))
* set initial stability fee index for past minters ([199c045](https://github.com/VenusProtocol/venus-protocol/commit/199c045351bbfe59667402c1620140a0d9cf48ac))
* set timelock delays to time units ([4a29128](https://github.com/VenusProtocol/venus-protocol/commit/4a29128b0b71eac03eb6024ce31bc20767e31e26))
* srs-02, srs-07 missing checks for vToken, pass single address ([99fc4b2](https://github.com/VenusProtocol/venus-protocol/commit/99fc4b2014e4a44cd4d484454f46860ca39121f4))
* SRS-03 check the address(0) for comptroller address in swapRouter constructor ([48eb87c](https://github.com/VenusProtocol/venus-protocol/commit/48eb87ca15b5dd373a6db112f9f777561f38cf54))
* SRS-04 added comments for supporting Fee for all the functions in Swaprouter ([4dae8d4](https://github.com/VenusProtocol/venus-protocol/commit/4dae8d41b71aba8fe5243d551771c9d9ea2163d4))
* srs-05 added comments for missing parameters ([f04f5ce](https://github.com/VenusProtocol/venus-protocol/commit/f04f5cebebe98d54fe77171df03ea7ea48efddb3))
* SRS-06 netspec comments changed for sweepToken function ([ae30cdd](https://github.com/VenusProtocol/venus-protocol/commit/ae30cdd868cfe370ca1fd7c2d11288c000892084))
* support fees on transfers and approve vToken ([d4969d7](https://github.com/VenusProtocol/venus-protocol/commit/d4969d7082f6bda1a22db2230253128a3e3f3db9))
* swa-01 reentrant check ([844f78d](https://github.com/VenusProtocol/venus-protocol/commit/844f78d9c21416671ea5c79cae47181098428d16))
* SWA-02 added unchecked block in the for loop iteration ([b3542eb](https://github.com/VenusProtocol/venus-protocol/commit/b3542eb3a772aabeac78537d0e93c02c0594c3aa))
* swa-03 used custom errors instead of string errors ([ebef2cd](https://github.com/VenusProtocol/venus-protocol/commit/ebef2cd84a55222f2503ff427c1547d69f5cd864))
* swap fork tests ([c3a0fb2](https://github.com/VenusProtocol/venus-protocol/commit/c3a0fb202bd58eccb13839af4ff30231c2939958))
* update imports of package files ([9806697](https://github.com/VenusProtocol/venus-protocol/commit/9806697bc4d42dd9f4beb71b72e467b78dac36a5))
* update publish command ([2177df9](https://github.com/VenusProtocol/venus-protocol/commit/2177df93548c9437f78e2c57ab6805f96c6c6735))
* upgrade compiler and lock pragma version ([ed19a94](https://github.com/VenusProtocol/venus-protocol/commit/ed19a9407a457e73864de864088fde36be6142ba))
* use custom errors instead of error strings ([4208e85](https://github.com/VenusProtocol/venus-protocol/commit/4208e85199ae31084981b7887ec8de8b12ea2a41))
* VEN-005 Change external function naming ([48c85bf](https://github.com/VenusProtocol/venus-protocol/commit/48c85bf3c6259a9cf48846c31c07b8f830dff930))
* VENUS-002 remove checks with true/false in require ([fa35f34](https://github.com/VenusProtocol/venus-protocol/commit/fa35f34db15afdeee5a5630b2570419a9d09731e))
* VENUS-003 check for zero address ([e9a2e5a](https://github.com/VenusProtocol/venus-protocol/commit/e9a2e5a924c5878e5d23b7a406ca1426171c89eb))
* VENUS-004 fix floating pragmas ([7c3d2e0](https://github.com/VenusProtocol/venus-protocol/commit/7c3d2e0dd696118fd85b242f322fcb2e284cf4bd))
* VENUS-006 add market active check ([4279d0d](https://github.com/VenusProtocol/venus-protocol/commit/4279d0d8984d4a90a81172797112325d289a9ebc))
* VENUS-007 prevent massUpdatePools function ([027914e](https://github.com/VenusProtocol/venus-protocol/commit/027914e858b0db22bec5f690bf6c6009bea15421))
* working docker setup ([252f201](https://github.com/VenusProtocol/venus-protocol/commit/252f201d3302752141d1858a3d6d0863de1a2a68))
* xvs -> xvsVault in GovernerBravo cancellation test ([83ccbe0](https://github.com/VenusProtocol/venus-protocol/commit/83ccbe0d3538dff6642f747e1537bf78db6e6f20))


### Reverts

* Revert "refactor: use PriceOracle from oracle repo" ([d8401ef](https://github.com/VenusProtocol/venus-protocol/commit/d8401ef8f69e682d194f008c8b3084970f4f5d59))
* Revert "Fix cache errors in scenario installation" ([9385dba](https://github.com/VenusProtocol/venus-protocol/commit/9385dba2a60028e59fdad143e9468413e168b3c9))
