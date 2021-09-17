# Venus Protocol - deployment guide

[Spreadsheet for Deployment Guide](https://docs.google.com/spreadsheets/d/1pVlxiujckcXO0OLls-EIVvvcLpN95nVBhYs_g1SeYho/)

## List of contracts for deployment

|Sequence|Contract Name|Contract Description|Constructor Arguments| Post Deployment Activities | Depends On | 
|---|---|---|---|---|---|
|1|XVS|Venus Voting Token Contract | - | - | - |
|2|Timelock| Contract to act as owner for all vTokens. deployer will be timelockOwner during deployment  | [timelockOwner, timelockDelay] | post deployment of GovernorAlpha, GovernorAlpha should be owner of Timelock | - |
|3|GovernorAlpha| Governance contract and Owner for Timelock contract. | [timelockAddress, xvsAddress, guardian] | post deployment of GovernorAlpha, GovernorAlpha should be owner of Timelock | - |
|4|Comptroller| Gateway for all function calls | - | - | - |
|5|Unitroller|Gateway for Comptroller. fallback function of Unitroller will delegae the call to Comptroller| - | Comptroller to become implementation of Unitroller, Set Timelock as admin for Unitroller | Comptroller, Timelock |
|6|VAI| - | chainId = 4 | - | - |
|7|VAIUniTroller|||| - |
|8|VAIController|||| - |
|9|vBNB|||| - |
|10|Maximillion|||| - |
|11|JumpRateModel|||| - |
|12|VBep20Delegate|||| - |
|13|VenusChainlinkOracle|||| - |
|14|VenusLens|||| - |

## Deployment Instructions

---------------
1. XVS

   1. deploy XVS Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-xvs.js -n rinkeby
      ```

   2. Copy XVS address from command console to JSON object in `rinkeby.json`   

      - [rinkeby_Contracts_XVS_address](../../networks/rinkeby.json#L146)

---------------
2. Timelock

   1. deploy Timelock Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-timelock.js -n rinkeby
      ```

   2. Copy Timelock address from command console to JSON object in `rinkeby.json`   

      - [rinkeby_Contracts_Timelock_address](../../networks/rinkeby.json#L14)
      - [rinkeby_Contracts_Timelock_Contract](../../networks/rinkeby.json#L76)

   3. Copy Timelock constructor Data from command console to JSON object in `rinkeby.json` 

      - [rinkeby_Contracts_Timelock_Constructor_Data](../../networks/rinkeby.json#L133)

---------------
3. GovernorAlpha

   1. deploy GovernorAlpha Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-governor-alpha.js -n rinkeby
      ```

   2. Copy GovernorAlpha address from command console to JSON object in `rinkeby.json`   

      - [rinkeby_Contracts_GovernorAlpha_address](../../networks/rinkeby.json#L3)

---------------

4. Comptroller

   1. deploy Comptroller Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-comptroller.js -n rinkeby
      ```

   2. Copy Comptroller address from command console to JSON object in `rinkeby.json`   

      - [rinkeby_Contracts_Comptroller_address](../../networks/rinkeby.json#L7)

---------------
5. Unitroller

   1. deploy Unitroller Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-unitroller-and-set-timelock-as-admin.js -n rinkeby
      ```

   2. Copy Unitroller address from command console to JSON object in `rinkeby.json`   

      - [rinkeby_Contracts_Unitroller_address](../../networks/rinkeby.json#L6)
      - [rinkeby_Contracts_Unitroller_Contracts](../../networks/rinkeby.json#L61)

---------------
6. VAI

   1. deploy VAI Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-vai.js -n rinkeby
      ```

   2. copy VAI address from command conosle to JSON object in `rinkeby.json`

      [rinkeby_Contracts_VAI_address](../../networks/rinkeby.json#L152)

---------------
7. VAIController

   1. deploy VAIController Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-vai-controller.js -n rinkeby
      ```

   2. copy VAIController address from command conosle to JSON object in `rinkeby.json`

      [rinkeby_Contracts_vaiController_address](../../networks/rinkeby.json#L8)

---------------
8. VAIUniTroller

   1. deploy VAIUnitroller Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-vai-unitroller.js -n rinkeby
      ```

   2. copy vaiUnitroller address to JSON objects in `rinkeby.json`

      [rinkeby_Contracts_vaiUnitroller_address](../../networks/rinkeby.json#L9)

   3. update implementation address of vaiUnitroller

      ```sh
      npx saddle script script/deploy/vai-unitroller-admin-impl-update.js -n rinkeby
      ```

---------------
9. vBNB

   1. deploy vBNB Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-vBNB.js -n rinkeby
      ```

   2. copy vBNB address to JSON objects in `rinkeby.json`

      1. [rinkeby_Contracts_vBNB_address](../../networks/rinkeby.json#L30)

      2. [rinkeby_Tokens_vBNB_address](../../networks/rinkeby.json#L228)

      3. [rinkeby_vTokens_vBNB_address](../../networks/rinkeby.json#L328)

   3. constructor-data to be copied to JSON object under `rinkeby.json`
      [rinkeby_vBNB_Constructor_Data](../../networks/rinkeby.json#L132)

---------------
10. Maximillion

   1. copy vBNB Adress to Maximillion-JSON object in `rinkeby.json`

      [rinkeby_vBNB_In_Maximillion_Object](../../networks/rinkeby.json#L52)

   2. deploy Maximillion Contract to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-maximillion.js -n rinkeby
      ```

   3. copy Deployed address of Maximillion to JSON objects in `rinkeby.json`

      1. [rinkeby_Contracts_Maximillion_address](../../networks/rinkeby.json#L4)

      2. [rinkeby_Contracts_Maximillion_address](../../networks/rinkeby.json#L53)

      3. constructor-data to be copied to JSON object under `rinkeby.json`
         [rinkeby_Maximillion_Constructor_Data](../../networks/rinkeby.json#L122)

---------------

11. JumpRateModel

   1. deploy JumpRateModel Contract with command-line argument to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-jump-rate-model.js Base0bps_Slope2000bps_Jump20000bps_Kink90  -n rinkeby
      ```
   
   2. copy Deployed address of JumpRateModel to JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_Base0bps_Slope2000bps_Jump20000bps_Kink90_address](../../networks/rinkeby.json#L5)
      
      - [rinkeby_Contracts_Base0bps_Slope2000bps_Jump20000bps_Kink90_address](../../networks/rinkeby.json#L380)

---------------

12. VBep20Delegate

   1. deploy VBep20Delegate Contract with command-line argument to rinkeby

      ```sh
      npx saddle script script/deploy/deploy-vBep20Delegate.js -n rinkeby
      ```

   2. copy Deployed address of VBep20Delegate to JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_VBep20Delegate_address](../../networks/rinkeby.json#L10)

---------------

13. VenusChainlinkOracle

    1. Deploy VenusChainlinkOracle

      ```sh
      npx saddle script script/deploy/deploy-venus-chainlink-oracle.js -n rinkeby
      ```

    2. copy Deployed address of VenusChainlinkOracle to JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_VenusChainlinkOracle_address](../../networks/rinkeby.json#L13)

    3. Set Feed for vTokens with Underlying's with feed on rinkeby network
       Set DefaultPrice for Underlying's with no-chainlinkFeeds on rinkeby network

      ```sh
      npx saddle script script/deploy/set-feed-to-venus-chainlink-oracle.js -n rinkeby
      ```

---------------

14. VenusLens

    1. Deploy VenusLens

      ```sh
      npx saddle script script/deploy/deploy-venuslens.js -n rinkeby
      ```
    2. copy Deployed address of VenusLens to JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_Venuslens_address](../../networks/rinkeby.json#L11)

---------------
## List of vTokens for deployment

1. vUSDC

    1. Deploy vUSDC with constructor arguments

      ```sh
      npx saddle script script/deploy/deploy-vBEP20.js vUSDC Base0bps_Slope2000bps_Jump20000bps_Kink90 -n rinkeby
      ```

    2. copy Deployed address of vUSDC references in 3 different properties of JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_vUSDC_address](../../networks/rinkeby.json#L24)
      - [rinkeby_Contracts_vUSDC_address](../../networks/rinkeby.json#L168)
      - [rinkeby_Contracts_vUSDC_address](../../networks/rinkeby.json#L348)

   3. Timelock will be admin for all vTokens. set the admin of vUSDT with Timelock Address

      - [rinkeby_Contracts_set_Admin_For_vUSDC_address](../../networks/rinkeby.json#L167)
      - [rinkeby_Contracts_set_Admin_For_vUSDC_address](../../networks/rinkeby.json#L347)

   4. copy ConstructorData from command-console and set it to JSON-Property in `rinkeby.json`

      - [rinkeby_vUSDC_Constructor_Data](../../networks/rinkeby.json#L119)

---------------

2. vUSDT

   1. Deploy vUSDC with constructor arguments

      ```sh
      npx saddle script script/deploy/deploy-vBEP20.js vUSDT Base0bps_Slope2000bps_Jump20000bps_Kink90 -n rinkeby
      ```

   2. copy Deployed address of vUSDT references in 3 different properties of JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_vUSDT_address](../../networks/rinkeby.json#L25)
      - [rinkeby_Contracts_vUSDT_address](../../networks/rinkeby.json#L202)
      - [rinkeby_Contracts_vUSDT_address](../../networks/rinkeby.json#L368)

   3. Timelock will be admin for all vTokens. set the admin of vUSDT with Timelock Address

      - [rinkeby_Contracts_set_Admin_For_vUSDT_address](../../networks/rinkeby.json#L201)
      - [rinkeby_Contracts_set_Admin_For_vUSDT_address](../../networks/rinkeby.json#L367)

   4. copy ConstructorData from command-console and set it to JSON-Property in `rinkeby.json`

      - [rinkeby_vUSDT_Constructor_Data](../../networks/rinkeby.json#L129)

---------------

3. vDAI

   1. Deploy vDAI with constructor arguments

      ```sh
      npx saddle script script/deploy/deploy-vBEP20.js vDAI Base0bps_Slope2000bps_Jump20000bps_Kink90 -n rinkeby
      ```

   2. copy Deployed address of vDAI references in 3 different properties of JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_vDAI_address](../../networks/rinkeby.json#L16)
      - [rinkeby_Contracts_vDAI_address](../../networks/rinkeby.json#L178)
      - [rinkeby_Contracts_vDAI_address](../../networks/rinkeby.json#L319)

   3. Timelock will be admin for all vTokens. Set the admin of vDAI with Timelock Address

      - [rinkeby_Contracts_set_Admin_For_vDAI_address](../../networks/rinkeby.json#L177)
      - [rinkeby_Contracts_set_Admin_For_vDAI_address](../../networks/rinkeby.json#L318)

   4. copy ConstructorData from command-console and set it to JSON-Property in `rinkeby.json`

      - [rinkeby_vDAI_Constructor_Data](../../networks/rinkeby.json#L124)

---------------

4. vREP

   1. Deploy vREP with constructor arguments

      ```sh
      npx saddle script script/deploy/deploy-vBEP20.js vREP Base0bps_Slope2000bps_Jump20000bps_Kink90 -n rinkeby
      ```

   2. copy Deployed address of vREP references in 3 different properties of JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_vREP_address](../../networks/rinkeby.json#L20)
      - [rinkeby_Contracts_vREP_address](../../networks/rinkeby.json#L238)
      - [rinkeby_Contracts_vREP_address](../../networks/rinkeby.json#L329)

   3. Timelock will be admin for all vTokens, set the admin of vREP with Timelock Address

      - [rinkeby_Contracts_set_Admin_For_vREP_address](../../networks/rinkeby.json#L237)
      - [rinkeby_Contracts_set_Admin_For_vREP_address](../../networks/rinkeby.json#L328)

   4. copy ConstructorData from command-console and set it to JSON-Property in `rinkeby.json`

      - [rinkeby_vREP_Constructor_Data](../../networks/rinkeby.json#L134)

---------------

5. vWBTC

   1. Deploy vWBTC with constructor arguments

      ```sh
      npx saddle script script/deploy/deploy-vBEP20.js vWBTC Base0bps_Slope2000bps_Jump20000bps_Kink90 -n rinkeby
      ```

   2. copy Deployed address of vDAI references in 3 different properties of JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_vWBTC_address](../../networks/rinkeby.json#L18)
      - [rinkeby_Contracts_vWBTC_address](../../networks/rinkeby.json#L272)
      - [rinkeby_Contracts_vWBTC_address](../../networks/rinkeby.json#L358)

   3. Timelock will be admin for all vTokens. set the admin of vWBTC with Timelock Address

      - [rinkeby_Contracts_set_Admin_For_vWBTC_address](../../networks/rinkeby.json#L271)
      - [rinkeby_Contracts_set_Admin_For_vWBTC_address](../../networks/rinkeby.json#L357)

   4. copy ConstructorData from command-console and set it to JSON-Property in `rinkeby.json`

      - [rinkeby_vWBTC_Constructor_Data](../../networks/rinkeby.json#L138)

---------------

6. vZRX

   1. Deploy vZRX with constructor arguments

      ```sh
      npx saddle script script/deploy/deploy-vBEP20.js vZRX Base0bps_Slope2000bps_Jump20000bps_Kink90 -n rinkeby
      ```

   2. copy Deployed address of vZRX references in 3 different properties of JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_vZRX_address](../../networks/rinkeby.json#L22)
      - [rinkeby_Contracts_vZRX_address](../../networks/rinkeby.json#L262)
      - [rinkeby_Contracts_vZRX_address](../../networks/rinkeby.json#L299)

   3. Timelock will be admin for all vTokens. set the admin of vZRX with Timelock Address

      - [rinkeby_Contracts_set_Admin_For_vZRX_address](../../networks/rinkeby.json#L261)
      - [rinkeby_Contracts_set_Admin_For_vZRX_address](../../networks/rinkeby.json#L298)

   4. copy ConstructorData from command-console and set it to JSON-Property in `rinkeby.json`

      - [rinkeby_vZRX_Constructor_Data](../../networks/rinkeby.json#L137)

---------------

7. vBAT

   1. Deploy vBAT with constructor arguments

      ```sh
      npx saddle script script/deploy/deploy-vBEP20.js vBAT Base0bps_Slope2000bps_Jump20000bps_Kink90 -n rinkeby
      ```

   2. copy Deployed address of vBAT references in 3 different properties of JSON objects in `rinkeby.json`

      - [rinkeby_Contracts_vBAT_address](../../networks/rinkeby.json#L28)
      - [rinkeby_Contracts_vBAT_address](../../networks/rinkeby.json#L212)
      - [rinkeby_Contracts_vBAT_address](../../networks/rinkeby.json#L309)

   3. Timelock will be admin for all vTokens. set the admin of vBAT with Timelock Address

      - [rinkeby_Contracts_set_Admin_For_vBAT_address](../../networks/rinkeby.json#L211)
      - [rinkeby_Contracts_set_Admin_For_vBAT_address](../../networks/rinkeby.json#L308)

   4. copy ConstructorData from command-console and set it to JSON-Property in `rinkeby.json`

      - [rinkeby_vBAT_Constructor_Data](../../networks/rinkeby.json#L130)

---------------
### Sample ExecutionLog for vToken (vUSDC)

```
% npx saddle script script/deploy/deploy-vBEP20.js vUSDC Base0bps_Slope2000bps_Jump20000bps_Kink90 -n rinkeby

web3-shh package will be deprecated in version 1.3.5 and will no longer be supported.
web3-bzz package will be deprecated in version 1.3.5 and will no longer be supported.
Using network rinkeby https://rinkeby.infura.io/v3/6c3cf934f4fb4e5a862fba01abd5aed6
Running script script/deploy/deploy-vBEP20.js on network rinkeby https://rinkeby.infura.io/v3/6c3cf934f4fb4e5a862fba01abd5aed6 with args ["vUSDC","Base0bps_Slope2000bps_Jump20000bps_Kink90"]
constructor data for vBNB is: 0x0000000000000000000000004dbcdf9b62e891a7cec5a2568c3f4faf9e8abe2b00000000000000000000000029664f59234b33d90e94433e4cbe97b53db890a30000000000000000000000007a85dc04a14c38e828ebeaf97d75d68579cea5350000000000000000000000000000000000000000000000000000b5e620f48000000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001800000000000000000000000000000000000000000000000000000000000000008000000000000000000000000f719dddaf430c7f7995a456303e3785dbc55ac8f0000000000000000000000000256b1404e41f887fd003d5b257d7dcce4bf04a400000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000001356656e75732055534420436f696e20f09f938800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000576555344430000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
Deploying vUSDC with constructorData: ["0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b","0x29664F59234B33d90e94433E4cBE97b53db890a3","0x7a85dc04a14c38E828ebeaf97d75d68579cEa535","200000000000000","Venus USD Coin 📈","vUSDC",8,"0xf719Dddaf430c7f7995a456303e3785dbC55AC8f","0x0256B1404E41f887fD003D5B257D7Dcce4Bf04a4","0x"] 
Deployed vUSDC to 0xaE0aEe28d4186689d7B9C14Df78bc0737eAECEF0
Script finished in 18549ms.
```