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
