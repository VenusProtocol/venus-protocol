let { loadConf } = require("./support/tokenConfig");

function printUsage() {
  console.log(`
usage: npx saddle script token:deploy {tokenConfig}

note: pass VERIFY=true and BSCSCAN_API_KEY=<api key> to verify contract on BscScan

example:

npx saddle -n rinkeby script token:deploy '{
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

function sleep(timeout) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
}

(async function () {
  // @FIX ME This script had undefined vars have been stubbed out for linting
  const network = process.env.NETWORK;
  const addresses = [];
  const args = [];
  if (args.length !== 1) {
    return printUsage();
  }

  let conf = loadConf(args[0], addresses);
  if (!conf) {
    return printUsage();
  }

  console.log(`Deploying vToken with ${JSON.stringify(conf)}`);

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
  let contract = await saddle.deploy("VBep20Immutable", deployArgs);

  console.log(`Deployed contract to ${contract._address}`);

  if (env["VERIFY"]) {
    const bscscanApiKey = env["BSCSCAN_API_KEY"];
    if (bscscanApiKey === undefined || bscscanApiKey.length === 0) {
      throw new Error(`BSCSCAN_API_KEY must be set if using VERIFY flag...`);
    }

    console.log(`Sleeping for 30 seconds then verifying contract on BscScan...`);
    await sleep(30000); // Give BscScan time to learn about contract
    console.log(`Now verifying contract on BscScan...`);

    await saddle.verify(bscscanApiKey, contract._address, "VBep20Immutable", deployArgs, 0);
    console.log(`Contract verified at https://${network}.bscscan.io/address/${contract._address}`);
  }

  return {
    ...conf,
    address: contract._address,
  };
})();
