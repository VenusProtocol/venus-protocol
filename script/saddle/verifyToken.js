let { loadAddress, loadConf } = require("./support/tokenConfig");

function printUsage() {
  console.log(`
usage: npx saddle script token:verify {tokenAddress} {tokenConfig}

note: $BSCSCAN_API_KEY environment variable must be set to an BscScan API Key.

example:

npx saddle -n rinkeby script token:verify 0x19B674715cD20626415C738400FDd0d32D6809B6 '{
  "underlying": "0x577D296678535e4903D59A4C929B718e1D575e0A",
  "comptroller": "$Comptroller",
  "interestRateModel": "$Base200bps_Slope3000bps",
  "initialExchangeRateMantissa": "2.0e18",
  "name": "Venus Kyber Network Crystal",
  "symbol": "vKNC",
  "decimals": "8",
  "admin": "$Timelock"
}'
  `);
}
(async function () {
  // @FIX ME This script had undefined vars have been stubbed out for linting
  const args = [];
  const addresses = [];
  const network = process.env.NETWORK;
  if (args.length !== 2) {
    return printUsage();
  }
  let address = loadAddress(args[0], addresses);
  let conf = loadConf(args[1], addresses);
  if (!conf) {
    return printUsage();
  }
  let bscscanApiKey = env["BSCSCAN_API_KEY"];
  if (!bscscanApiKey) {
    console.error("Missing required $BSCSCAN_API_KEY env variable.");
    return printUsage();
  }

  console.log(`Verifying vToken at ${address} with ${JSON.stringify(conf)}`);

  let deployArgs = [
    conf.underlying,
    conf.comptroller,
    conf.interestRateModel,
    conf.initialExchangeRateMantissa.toString(),
    conf.name,
    conf.symbol,
    conf.decimals,
    conf.admin,
  ];

  // TODO: Make sure we match optimizations count, etc
  await saddle.verify(bscscanApiKey, address, "VBep20Immutable", deployArgs, 200, undefined);

  console.log(`Contract verified at https://${network}.bscscan.io/address/${address}`);

  return {
    ...conf,
    address,
  };
})();
