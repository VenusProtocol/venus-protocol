const [network] = args;
const contractConfigData = require(`../../../../networks/${network}.json`);
const { encodeParameters } = require("../../utils/web3-utils");

(async () => {
  const vTRXAddress = contractConfigData.Contracts.vTRX;
  const unitrollerAddress = contractConfigData.Contracts.Unitroller;

  const payload_setReserveFactor = web3.eth.abi.encodeParameter("uint256", "200000000000000000");
  const payload_supportMarket = web3.eth.abi.encodeParameter("address", vTRXAddress);
  const payload_setCollateralFactor = encodeParameters(["address", "uint256"], [vTRXAddress, "600000000000000000"]);
  const payload_setVenusSpeed = encodeParameters(["address", "uint256"], [vTRXAddress, "868055555555556"]);

  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;
  const governorBravoDelegateContractInstance = await saddle.getContractAt(
    "GovernorBravoDelegate",
    governorBravoDelegatorAddress,
  );

  const txn = await governorBravoDelegateContractInstance.methods
    .propose(
      [vTRXAddress, unitrollerAddress, unitrollerAddress, unitrollerAddress],
      [0, 0, 0, 0],
      [
        "_setReserveFactor(uint256)",
        "_supportMarket(address)",
        "_setCollateralFactor(address,uint256)",
        "_setVenusSpeed(address,uint256)",
      ],
      [payload_setReserveFactor, payload_supportMarket, payload_setCollateralFactor, payload_setVenusSpeed],
      "Support TRON on Venus",
    )
    .send();

  console.log(`GovernorBravoDelegate - propose Add vTRX to SupportedMarkets :: with transactionStatus ${txn.status}`);
})();
