const hre = require("hardhat");
const ethers = hre.ethers;

const Mainnet = require("../../networks/mainnet.json");
const Testnet = require("../../networks/testnet.json");

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  const swapRouterContractFactory = await ethers.getContractFactory("SwapRouter");

  const network = process.env.FORK_MAINNET === "true" ? Mainnet : Testnet;

  const WBNB = network.Contracts.WBNB;
  const FACTORY = network.Contracts.pancakeFactory;
  const COMPTROLLER = network.Contracts.Unitroller;
  const VBNB = network.Contracts.vBNB;

  const swapRouterDeploy = await swapRouterContractFactory.deploy(WBNB, FACTORY, COMPTROLLER, VBNB);
  await swapRouterDeploy.deployed();

  console.log(`deployer: ${deployer} deployed ComptrollerLens at address: ${swapRouterDeploy.address}`);
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
