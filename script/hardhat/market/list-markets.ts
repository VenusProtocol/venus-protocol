import { ethers } from "hardhat";

const COMPTROLLER_ABI = [
  "function getAllMarkets() external view returns (address[])",
  "function markets(address) external view returns (bool isListed, uint256 collateralFactorMantissa, bool isVenus, uint256 liquidationThresholdMantissa, uint256 liquidationIncentiveMantissa, uint96 marketPoolId, bool isBorrowAllowed)",
];

const VTOKEN_ABI = [
  "function symbol() external view returns (string)",
  "function underlying() external view returns (address)",
];

async function main() {
  const comptrollerAddress = process.env.COMPTROLLER_ADDRESS;
  if (!comptrollerAddress) {
    throw new Error("Set COMPTROLLER_ADDRESS env variable");
  }

  const comptroller = await ethers.getContractAt(COMPTROLLER_ABI, comptrollerAddress);
  const allMarkets: string[] = await comptroller.getAllMarkets();

  const listed: { address: string; symbol: string }[] = [];
  const unlisted: { address: string; symbol: string }[] = [];

  for (const market of allMarkets) {
    const vToken = await ethers.getContractAt(VTOKEN_ABI, market);
    let symbol: string;
    try {
      symbol = await vToken.symbol();
    } catch {
      symbol = "UNKNOWN";
    }

    const [isListed] = await comptroller.markets(market);

    if (isListed) {
      listed.push({ address: market, symbol });
    } else {
      unlisted.push({ address: market, symbol });
    }
  }

  console.log(`\nTotal markets: ${allMarkets.length}\n`);

  console.log(`Listed markets (${listed.length}):`);
  console.log("-".repeat(60));
  for (const m of listed) {
    console.log(`  ${m.symbol.padEnd(20)} ${m.address}`);
  }

  console.log(`\nUnlisted markets (${unlisted.length}):`);
  console.log("-".repeat(60));
  for (const m of unlisted) {
    console.log(`  ${m.symbol.padEnd(20)} ${m.address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
