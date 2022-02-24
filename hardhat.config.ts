/**
 * @type import('hardhat/config').HardhatUserConfig
 */
 import { HardhatUserConfig } from "hardhat/types";
 import '@openzeppelin/hardhat-upgrades';
 
 import "@nomiclabs/hardhat-truffle5";
 import "@nomiclabs/hardhat-waffle";
 import "@nomiclabs/hardhat-etherscan";
 import "hardhat-typechain";
 
 import { ethers } from 'ethers';
 require("dotenv").config();

 const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || 'scanapikey';
 const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '5d5213613985d1d0ba01d9b5376269d0caca14f1da0f643ae2d124e5d5d4254f';
 
 const config: HardhatUserConfig = {
   defaultNetwork: "hardhat",
   solidity: {
     compilers: [
       {
         version: "0.5.16",
         settings: {
           optimizer: {
             enabled: true,
             runs: 200
           }
         }
       }
     ],
   },
   networks: {
     bsctestnet: {
       url: process.env.BSC_TESTNET_NODE || 'https://data-seed-prebsc-1-s1.binance.org:8545',
       chainId: 97,
       accounts: [`0x${DEPLOYER_PRIVATE_KEY}`],
       gasPrice: ethers.utils.parseUnits("10", "gwei").toNumber(),
       gasMultiplier: 10,
       timeout: 12000000,
     },
     hardhat: {
       chainId: 56,
       forking: {
         url: process.env.BSC_ARCHIVE_NODE || '',
       }
     },
     // currently not used, we are still using saddle to deploy contracts
     bscmainnet: {
       url: `https://bsc-dataseed.binance.org/`,
       accounts: [`0x${DEPLOYER_PRIVATE_KEY}`]
     },
   },
   etherscan: {
     apiKey: BSCSCAN_API_KEY,
   },
   paths: {
     sources: "./contracts",
     tests: "./tests/hardhat",
     cache: "./cache",
     artifacts: "./artifacts"
   },
   mocha: {
     timeout: 20000
   }
 };
 
 export default config;