import { buildComptrollerImpl } from "../Builder/ComptrollerImplBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { decodeCall, getPastEvents } from "../Contract";
import { Comptroller } from "../Contract/Comptroller";
import { VToken } from "../Contract/VToken";
import { getComptroller } from "../ContractLookup";
import {
  getAddressV,
  getBoolV,
  getCoreValue,
  getEventV,
  getExpNumberV,
  getNumberV,
  getPercentV,
  getStringV,
} from "../CoreValue";
import { ComptrollerErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { encodeABI, rawValues } from "../Utils";
import { AddressV, BoolV, EventV, NumberV, StringV } from "../Value";
import { getLiquidity } from "../Value/ComptrollerValue";
import { getVTokenV } from "../Value/VTokenValue";
import { World, addAction, describeUser } from "../World";

async function genComptroller(world: World, from: string, params: Event): Promise<World> {
  const {
    world: nextWorld,
    comptrollerImpl: comptroller,
    comptrollerImplData: comptrollerData,
  } = await buildComptrollerImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added Comptroller (${comptrollerData.description}) at address ${comptroller._address}`,
    comptrollerData.invokation,
  );

  return world;
}

async function setProtocolPaused(
  world: World,
  from: string,
  comptroller: Comptroller,
  isPaused: boolean,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setProtocolPaused(isPaused),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Comptroller: set protocol paused to ${isPaused}`, invokation);

  return world;
}

async function setMaxAssets(
  world: World,
  from: string,
  comptroller: Comptroller,
  numberOfAssets: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setMaxAssets(numberOfAssets.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Set max assets to ${numberOfAssets.show()}`, invokation);

  return world;
}

async function setLiquidationIncentive(
  world: World,
  from: string,
  comptroller: Comptroller,
  liquidationIncentive: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setLiquidationIncentive(liquidationIncentive.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Set liquidation incentive to ${liquidationIncentive.show()}`, invokation);

  return world;
}

async function setLiquidatorContract(
  world: World,
  from: string,
  comptroller: Comptroller,
  newLiquidatorContract_: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setLiquidatorContract(newLiquidatorContract_),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Set liquidator contract to ${newLiquidatorContract_}`, invokation);

  return world;
}

async function supportMarket(world: World, from: string, comptroller: Comptroller, vToken: VToken): Promise<World> {
  if (world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world.printer.printLine(`Dry run: Supporting market  \`${vToken._address}\``);
    return world;
  }

  const invokation = await invoke(
    world,
    comptroller.methods._supportMarket(vToken._address),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Supported market ${vToken.name}`, invokation);

  return world;
}

async function unlistMarket(world: World, from: string, comptroller: Comptroller, vToken: VToken): Promise<World> {
  const invokation = await invoke(world, comptroller.methods.unlist(vToken._address), from, ComptrollerErrorReporter);

  world = addAction(world, `Unlisted market ${vToken.name}`, invokation);

  return world;
}

async function enterMarkets(world: World, from: string, comptroller: Comptroller, assets: string[]): Promise<World> {
  const invokation = await invoke(world, comptroller.methods.enterMarkets(assets), from, ComptrollerErrorReporter);

  world = addAction(world, `Called enter assets ${assets} as ${describeUser(world, from)}`, invokation);

  return world;
}

async function exitMarket(world: World, from: string, comptroller: Comptroller, asset: string): Promise<World> {
  const invokation = await invoke(world, comptroller.methods.exitMarket(asset), from, ComptrollerErrorReporter);

  world = addAction(world, `Called exit market ${asset} as ${describeUser(world, from)}`, invokation);

  return world;
}

async function setPriceOracle(
  world: World,
  from: string,
  comptroller: Comptroller,
  priceOracleAddr: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setPriceOracle(priceOracleAddr),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Set price oracle for to ${priceOracleAddr} as ${describeUser(world, from)}`, invokation);

  return world;
}

async function setCollateralFactor(
  world: World,
  from: string,
  comptroller: Comptroller,
  vToken: VToken,
  collateralFactor: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setCollateralFactor(vToken._address, collateralFactor.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Set collateral factor for ${vToken.name} to ${collateralFactor.show()}`, invokation);

  return world;
}

async function setCloseFactor(
  world: World,
  from: string,
  comptroller: Comptroller,
  closeFactor: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setCloseFactor(closeFactor.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Set close factor to ${closeFactor.show()}`, invokation);

  return world;
}

async function setVAIMintRate(
  world: World,
  from: string,
  comptroller: Comptroller,
  vaiMintRate: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setVAIMintRate(vaiMintRate.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Set vai mint rate to ${vaiMintRate.show()}`, invokation);

  return world;
}

async function setVAIController(
  world: World,
  from: string,
  comptroller: Comptroller,
  vaicontroller: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setVAIController(vaicontroller),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Set VAIController to ${vaicontroller} as ${describeUser(world, from)}`, invokation);

  return world;
}

async function fastForward(world: World, from: string, comptroller: Comptroller, blocks: NumberV): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods.fastForward(blocks.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Fast forward ${blocks.show()} blocks to #${invokation.value}`, invokation);

  return world;
}

async function sendAny(
  world: World,
  from: string,
  comptroller: Comptroller,
  signature: string,
  callArgs: string[],
): Promise<World> {
  const fnData = encodeABI(world, signature, callArgs);
  await world.web3.eth.sendTransaction({
    to: comptroller._address,
    data: fnData,
    from: from,
  });
  return world;
}

async function addVenusMarkets(
  world: World,
  from: string,
  comptroller: Comptroller,
  vTokens: VToken[],
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._addVenusMarkets(vTokens.map(c => c._address)),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Added Venus markets ${vTokens.map(c => c.name)}`, invokation);

  return world;
}

async function dropVenusMarket(world: World, from: string, comptroller: Comptroller, vToken: VToken): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._dropVenusMarket(vToken._address),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Drop Venus market ${vToken.name}`, invokation);

  return world;
}

async function refreshVenusSpeeds(world: World, from: string, comptroller: Comptroller): Promise<World> {
  const invokation = await invoke(world, comptroller.methods.refreshVenusSpeeds(), from, ComptrollerErrorReporter);

  world = addAction(world, `Refreshed Venus speeds`, invokation);

  return world;
}

async function claimVenus(world: World, from: string, comptroller: Comptroller, holder: string): Promise<World> {
  const invokation = await invoke(world, comptroller.methods.claimVenus(holder), from, ComptrollerErrorReporter);

  world = addAction(world, `XVS claimed by ${holder}`, invokation);

  return world;
}

async function grantXVS(
  world: World,
  from: string,
  comptroller: Comptroller,
  recipient: string,
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._grantXVS(recipient, amount.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `${amount.show()} xvs granted to ${recipient}`, invokation);

  return world;
}

async function setVenusRate(world: World, from: string, comptroller: Comptroller, rate: NumberV): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setVenusRate(rate.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `XVS rate set to ${rate.show()}`, invokation);

  return world;
}

async function setVenusSpeed(
  world: World,
  from: string,
  comptroller: Comptroller,
  vToken: VToken,
  speed: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setVenusSpeed(vToken._address, speed.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Venus speed for market ${vToken._address} set to ${speed.show()}`, invokation);

  return world;
}

async function printLiquidity(world: World, comptroller: Comptroller): Promise<World> {
  const enterEvents = await getPastEvents(world, comptroller, "StdComptroller", "MarketEntered");
  const addresses = enterEvents.map(event => event.returnValues["account"]);
  const uniq = [...new Set(addresses)];

  world.printer.printLine("Liquidity:");

  const liquidityMap = await Promise.all(
    uniq.map(async address => {
      const userLiquidity = await getLiquidity(world, comptroller, address);

      return [address, userLiquidity.val];
    }),
  );

  liquidityMap.forEach(([address, liquidity]) => {
    world.printer.printLine(`\t${world.settings.lookupAlias(address)}: ${liquidity / 1e18}e18`);
  });

  return world;
}

async function setPendingAdmin(
  world: World,
  from: string,
  comptroller: Comptroller,
  newPendingAdmin: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setPendingAdmin(newPendingAdmin),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(
    world,
    `Comptroller: ${describeUser(world, from)} sets pending admin to ${newPendingAdmin}`,
    invokation,
  );

  return world;
}

async function acceptAdmin(world: World, from: string, comptroller: Comptroller): Promise<World> {
  const invokation = await invoke(world, comptroller.methods._acceptAdmin(), from, ComptrollerErrorReporter);

  world = addAction(world, `Comptroller: ${describeUser(world, from)} accepts admin`, invokation);

  return world;
}

async function setMarketBorrowCaps(
  world: World,
  from: string,
  comptroller: Comptroller,
  vTokens: VToken[],
  borrowCaps: NumberV[],
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setMarketBorrowCaps(
      vTokens.map(c => c._address),
      borrowCaps.map(c => c.encode()),
    ),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Borrow caps on ${vTokens} set to ${borrowCaps}`, invokation);

  return world;
}

async function setBorrowCapGuardian(
  world: World,
  from: string,
  comptroller: Comptroller,
  newBorrowCapGuardian: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setBorrowCapGuardian(newBorrowCapGuardian),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(
    world,
    `Comptroller: ${describeUser(world, from)} sets borrow cap guardian to ${newBorrowCapGuardian}`,
    invokation,
  );

  return world;
}

async function setMarketSupplyCaps(
  world: World,
  from: string,
  comptroller: Comptroller,
  vTokens: VToken[],
  supplyCaps: NumberV[],
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setMarketSupplyCaps(
      vTokens.map(c => c._address),
      supplyCaps.map(c => c.encode()),
    ),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(world, `Supply caps on ${vTokens} set to ${supplyCaps}`, invokation);

  return world;
}

async function setComptrollerLens(
  world: World,
  from: string,
  comptroller: Comptroller,
  newComptrollerLens: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setComptrollerLens(newComptrollerLens),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(
    world,
    `Comptroller: ${describeUser(world, from)} sets comptroller lens to ${newComptrollerLens}`,
    invokation,
  );

  return world;
}

async function setTreasuryData(
  world: World,
  from: string,
  comptroller: Comptroller,
  guardian: string,
  address: string,
  percent: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptroller.methods._setTreasuryData(guardian, address, percent.encode()),
    from,
    ComptrollerErrorReporter,
  );

  world = addAction(
    world,
    `Set treasury data to guardian: ${guardian}, address: ${address}, percent: ${percent.show()}`,
    invokation,
  );

  return world;
}

export function comptrollerCommands() {
  return [
    new Command<{ comptrollerParams: EventV }>(
      `
        #### Deploy

        * "Comptroller Deploy ...comptrollerParams" - Generates a new Comptroller (not as Impl)
          * E.g. "Comptroller Deploy YesNo"
      `,
      "Deploy",
      [new Arg("comptrollerParams", getEventV, { variadic: true })],
      (world, from, { comptrollerParams }) => genComptroller(world, from, comptrollerParams.val),
    ),
    new Command<{ comptroller: Comptroller; isPaused: BoolV }>(
      `
        #### SetProtocolPaused

        * "Comptroller SetProtocolPaused <Bool>" - Pauses or unpaused protocol
          * E.g. "Comptroller SetProtocolPaused True"
      `,
      "SetProtocolPaused",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("isPaused", getBoolV)],
      (world, from, { comptroller, isPaused }) => setProtocolPaused(world, from, comptroller, isPaused.val),
    ),
    new Command<{ comptroller: Comptroller; vToken: VToken }>(
      `
        #### SupportMarket

        * "Comptroller SupportMarket <VToken>" - Adds support in the Comptroller for the given vToken
          * E.g. "Comptroller SupportMarket vZRX"
      `,
      "SupportMarket",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("vToken", getVTokenV)],
      (world, from, { comptroller, vToken }) => supportMarket(world, from, comptroller, vToken),
    ),
    new Command<{ comptroller: Comptroller; vToken: VToken }>(
      `
        #### UnList

        * "Comptroller UnList <VToken>" - Mock unlists a given market in tests
          * E.g. "Comptroller UnList vZRX"
      `,
      "UnList",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("vToken", getVTokenV)],
      (world, from, { comptroller, vToken }) => unlistMarket(world, from, comptroller, vToken),
    ),
    new Command<{ comptroller: Comptroller; vTokens: VToken[] }>(
      `
        #### EnterMarkets

        * "Comptroller EnterMarkets (<VToken> ...)" - User enters the given markets
          * E.g. "Comptroller EnterMarkets (vZRX vBNB)"
      `,
      "EnterMarkets",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("vTokens", getVTokenV, { mapped: true })],
      (world, from, { comptroller, vTokens }) =>
        enterMarkets(
          world,
          from,
          comptroller,
          vTokens.map(c => c._address),
        ),
    ),
    new Command<{ comptroller: Comptroller; vToken: VToken }>(
      `
        #### ExitMarket

        * "Comptroller ExitMarket <VToken>" - User exits the given markets
          * E.g. "Comptroller ExitMarket vZRX"
      `,
      "ExitMarket",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("vToken", getVTokenV)],
      (world, from, { comptroller, vToken }) => exitMarket(world, from, comptroller, vToken._address),
    ),
    new Command<{ comptroller: Comptroller; maxAssets: NumberV }>(
      `
        #### SetMaxAssets

        * "Comptroller SetMaxAssets <Number>" - Sets (or resets) the max allowed asset count
          * E.g. "Comptroller SetMaxAssets 4"
      `,
      "SetMaxAssets",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("maxAssets", getNumberV)],
      (world, from, { comptroller, maxAssets }) => setMaxAssets(world, from, comptroller, maxAssets),
    ),
    new Command<{ comptroller: Comptroller; liquidationIncentive: NumberV }>(
      `
        #### LiquidationIncentive

        * "Comptroller LiquidationIncentive <Number>" - Sets the liquidation incentive
          * E.g. "Comptroller LiquidationIncentive 1.1"
      `,
      "LiquidationIncentive",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("liquidationIncentive", getExpNumberV)],
      (world, from, { comptroller, liquidationIncentive }) =>
        setLiquidationIncentive(world, from, comptroller, liquidationIncentive),
    ),
    new Command<{ comptroller: Comptroller; newLiquidatorContract: AddressV }>(
      `
        #### SetLiquidatorContract

        * "Comptroller SetLiquidatorContract <Address>" - Sets the liquidator contract address
          * E.g. "Comptroller SetLiquidatorContract (Address Liquidator)"
      `,
      "SetLiquidatorContract",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("newLiquidatorContract", getAddressV)],
      (world, from, { comptroller, newLiquidatorContract }) =>
        setLiquidatorContract(world, from, comptroller, newLiquidatorContract.val),
    ),

    new Command<{ comptroller: Comptroller; newComptrollerLens: AddressV }>(
      `
        #### SetComptrollerLens

        * "Comptroller SetComptrollerLens <Address>" - Sets the comptroller lens contract address
          * E.g. "Comptroller SetComptrollerLens (Address ComptrollerLens)"
      `,
      "SetComptrollerLens",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("newComptrollerLens", getAddressV)],
      (world, from, { comptroller, newComptrollerLens }) =>
        setComptrollerLens(world, from, comptroller, newComptrollerLens.val),
    ),

    new Command<{ comptroller: Comptroller; priceOracle: AddressV }>(
      `
        #### SetPriceOracle

        * "Comptroller SetPriceOracle oracle:<Address>" - Sets the price oracle address
          * E.g. "Comptroller SetPriceOracle 0x..."
      `,
      "SetPriceOracle",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("priceOracle", getAddressV)],
      (world, from, { comptroller, priceOracle }) => setPriceOracle(world, from, comptroller, priceOracle.val),
    ),
    new Command<{ comptroller: Comptroller; vToken: VToken; collateralFactor: NumberV }>(
      `
        #### SetCollateralFactor

        * "Comptroller SetCollateralFactor <VToken> <Number>" - Sets the collateral factor for given vToken to number
          * E.g. "Comptroller SetCollateralFactor vZRX 0.1"
      `,
      "SetCollateralFactor",
      [
        new Arg("comptroller", getComptroller, { implicit: true }),
        new Arg("vToken", getVTokenV),
        new Arg("collateralFactor", getExpNumberV),
      ],
      (world, from, { comptroller, vToken, collateralFactor }) =>
        setCollateralFactor(world, from, comptroller, vToken, collateralFactor),
    ),
    new Command<{ comptroller: Comptroller; closeFactor: NumberV }>(
      `
        #### SetCloseFactor

        * "Comptroller SetCloseFactor <Number>" - Sets the close factor to given percentage
          * E.g. "Comptroller SetCloseFactor 0.2"
      `,
      "SetCloseFactor",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("closeFactor", getPercentV)],
      (world, from, { comptroller, closeFactor }) => setCloseFactor(world, from, comptroller, closeFactor),
    ),
    new Command<{ comptroller: Comptroller; vaiMintRate: NumberV }>(
      `
        #### SetVAIMintRate

        * "Comptroller SetVAIMintRate <Number>" - Sets the vai mint rate to given value
          * E.g. "Comptroller SetVAIMintRate 5e4"
      `,
      "SetVAIMintRate",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("vaiMintRate", getNumberV)],
      (world, from, { comptroller, vaiMintRate }) => setVAIMintRate(world, from, comptroller, vaiMintRate),
    ),
    new Command<{ comptroller: Comptroller; vaicontroller: AddressV }>(
      `
        #### SetVAIController

        * "Comptroller SetVAIController vaicontroller:<Address>" - Sets the vai controller address
          * E.g. "Comptroller SetVAIController 0x..."
      `,
      "SetVAIController",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("vaicontroller", getAddressV)],
      (world, from, { comptroller, vaicontroller }) => setVAIController(world, from, comptroller, vaicontroller.val),
    ),
    new Command<{ comptroller: Comptroller; newPendingAdmin: AddressV }>(
      `
        #### SetPendingAdmin

        * "Comptroller SetPendingAdmin newPendingAdmin:<Address>" - Sets the pending admin for the Comptroller
          * E.g. "Comptroller SetPendingAdmin Geoff"
      `,
      "SetPendingAdmin",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("newPendingAdmin", getAddressV)],
      (world, from, { comptroller, newPendingAdmin }) => setPendingAdmin(world, from, comptroller, newPendingAdmin.val),
    ),
    new Command<{ comptroller: Comptroller }>(
      `
        #### AcceptAdmin

        * "Comptroller AcceptAdmin" - Accepts admin for the Comptroller
          * E.g. "From Geoff (Comptroller AcceptAdmin)"
      `,
      "AcceptAdmin",
      [new Arg("comptroller", getComptroller, { implicit: true })],
      (world, from, { comptroller }) => acceptAdmin(world, from, comptroller),
    ),
    new Command<{ comptroller: Comptroller; blocks: NumberV; _keyword: StringV }>(
      `
        #### FastForward

        * "FastForward n:<Number> Blocks" - Moves the block number forward "n" blocks. Note: in "VTokenScenario" and "ComptrollerScenario" the current block number is mocked (starting at 100000). This is the only way for the protocol to see a higher block number (for accruing interest).
          * E.g. "Comptroller FastForward 5 Blocks" - Move block number forward 5 blocks.
      `,
      "FastForward",
      [
        new Arg("comptroller", getComptroller, { implicit: true }),
        new Arg("blocks", getNumberV),
        new Arg("_keyword", getStringV),
      ],
      (world, from, { comptroller, blocks }) => fastForward(world, from, comptroller, blocks),
    ),
    new View<{ comptroller: Comptroller }>(
      `
        #### Liquidity

        * "Comptroller Liquidity" - Prints liquidity of all minters or borrowers
      `,
      "Liquidity",
      [new Arg("comptroller", getComptroller, { implicit: true })],
      (world, { comptroller }) => printLiquidity(world, comptroller),
    ),
    new View<{ comptroller: Comptroller; input: StringV }>(
      `
        #### Decode

        * "Decode input:<String>" - Prints information about a call to a Comptroller contract
      `,
      "Decode",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("input", getStringV)],
      (world, { comptroller, input }) => decodeCall(world, comptroller, input.val),
    ),

    new Command<{ comptroller: Comptroller; signature: StringV; callArgs: StringV[] }>(
      `
      #### Send
      * Comptroller Send functionSignature:<String> callArgs[] - Sends any transaction to comptroller
      * E.g: Comptroller Send "setXVSAddress(address)" (Address XVS)
      `,
      "Send",
      [
        new Arg("comptroller", getComptroller, { implicit: true }),
        new Arg("signature", getStringV),
        new Arg("callArgs", getCoreValue, { variadic: true, mapped: true }),
      ],
      (world, from, { comptroller, signature, callArgs }) =>
        sendAny(world, from, comptroller, signature.val, rawValues(callArgs)),
    ),
    new Command<{ comptroller: Comptroller; vTokens: VToken[] }>(
      `
      #### AddVenusMarkets

      * "Comptroller AddVenusMarkets (<Address> ...)" - Makes a market XVS-enabled
      * E.g. "Comptroller AddVenusMarkets (vZRX vBAT)
      `,
      "AddVenusMarkets",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("vTokens", getVTokenV, { mapped: true })],
      (world, from, { comptroller, vTokens }) => addVenusMarkets(world, from, comptroller, vTokens),
    ),
    new Command<{ comptroller: Comptroller; vToken: VToken }>(
      `
      #### DropVenusMarket

      * "Comptroller DropVenusMarket <Address>" - Makes a market XVS
      * E.g. "Comptroller DropVenusMarket vZRX
      `,
      "DropVenusMarket",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("vToken", getVTokenV)],
      (world, from, { comptroller, vToken }) => dropVenusMarket(world, from, comptroller, vToken),
    ),

    new Command<{ comptroller: Comptroller }>(
      `
      #### RefreshVenusSpeeds

      * "Comptroller RefreshVenusSpeeds" - Recalculates all the Venus market speeds
      * E.g. "Comptroller RefreshVenusSpeeds
      `,
      "RefreshVenusSpeeds",
      [new Arg("comptroller", getComptroller, { implicit: true })],
      (world, from, { comptroller }) => refreshVenusSpeeds(world, from, comptroller),
    ),
    new Command<{ comptroller: Comptroller; holder: AddressV }>(
      `
      #### ClaimVenus

      * "Comptroller ClaimVenus <holder>" - Claims xvs
      * E.g. "Comptroller ClaimVenus Geoff
      `,
      "ClaimVenus",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("holder", getAddressV)],
      (world, from, { comptroller, holder }) => claimVenus(world, from, comptroller, holder.val),
    ),
    new Command<{ comptroller: Comptroller; recipient: AddressV; amount: NumberV }>(
      `
      #### GrantXVS
      * "Comptroller GrantXVS <recipient> <amount>" - Grants XVS to a recipient
      * E.g. "Comptroller GrantXVS Geoff 1e18
      `,
      "GrantXVS",
      [
        new Arg("comptroller", getComptroller, { implicit: true }),
        new Arg("recipient", getAddressV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { comptroller, recipient, amount }) => grantXVS(world, from, comptroller, recipient.val, amount),
    ),
    new Command<{ comptroller: Comptroller; rate: NumberV }>(
      `
      #### SetVenusRate

      * "Comptroller SetVenusRate <rate>" - Sets Venus rate
      * E.g. "Comptroller SetVenusRate 1e18
      `,
      "SetVenusRate",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("rate", getNumberV)],
      (world, from, { comptroller, rate }) => setVenusRate(world, from, comptroller, rate),
    ),
    new Command<{ comptroller: Comptroller; vToken: VToken; speed: NumberV }>(
      `
      #### SetVenusSpeed
      * "Comptroller SetVenusSpeed <vToken> <rate>" - Sets XVS speed for market
      * E.g. "Comptroller SetVenusSpeed vToken 1000
      `,
      "SetVenusSpeed",
      [
        new Arg("comptroller", getComptroller, { implicit: true }),
        new Arg("vToken", getVTokenV),
        new Arg("speed", getNumberV),
      ],
      (world, from, { comptroller, vToken, speed }) => setVenusSpeed(world, from, comptroller, vToken, speed),
    ),
    new Command<{ comptroller: Comptroller; vTokens: VToken[]; borrowCaps: NumberV[] }>(
      `
      #### SetMarketBorrowCaps
      * "Comptroller SetMarketBorrowCaps (<VToken> ...) (<borrowCap> ...)" - Sets Market Borrow Caps
      * E.g "Comptroller SetMarketBorrowCaps (vZRX vUSDC) (10000.0e18, 1000.0e6)
      `,
      "SetMarketBorrowCaps",
      [
        new Arg("comptroller", getComptroller, { implicit: true }),
        new Arg("vTokens", getVTokenV, { mapped: true }),
        new Arg("borrowCaps", getNumberV, { mapped: true }),
      ],
      (world, from, { comptroller, vTokens, borrowCaps }) =>
        setMarketBorrowCaps(world, from, comptroller, vTokens, borrowCaps),
    ),
    new Command<{ comptroller: Comptroller; newBorrowCapGuardian: AddressV }>(
      `
        #### SetBorrowCapGuardian
        * "Comptroller SetBorrowCapGuardian newBorrowCapGuardian:<Address>" - Sets the Borrow Cap Guardian for the Comptroller
          * E.g. "Comptroller SetBorrowCapGuardian Geoff"
      `,
      "SetBorrowCapGuardian",
      [new Arg("comptroller", getComptroller, { implicit: true }), new Arg("newBorrowCapGuardian", getAddressV)],
      (world, from, { comptroller, newBorrowCapGuardian }) =>
        setBorrowCapGuardian(world, from, comptroller, newBorrowCapGuardian.val),
    ),

    new Command<{ comptroller: Comptroller; vTokens: VToken[]; supplyCaps: NumberV[] }>(
      `
      #### SetMarketSupplyCaps
      * "Comptroller SetMarketSupplyCaps (<VToken> ...) (<borrowCap> ...)" - Sets Market Supply Caps
      * E.g "Comptroller SetMarketSupplyCaps (vZRX vUSDC) (10000.0e18, 1000.0e6)
      `,
      "SetMarketSupplyCaps",
      [
        new Arg("comptroller", getComptroller, { implicit: true }),
        new Arg("vTokens", getVTokenV, { mapped: true }),
        new Arg("supplyCaps", getNumberV, { mapped: true }),
      ],
      (world, from, { comptroller, vTokens, supplyCaps }) =>
        setMarketSupplyCaps(world, from, comptroller, vTokens, supplyCaps),
    ),

    new Command<{ comptroller: Comptroller; guardian: AddressV; address: AddressV; percent: NumberV }>(
      `
      #### SetTreasuryData
      * "Comptroller SetTreasuryData <guardian> <address> <rate>" - Sets Treasury Data
      * E.g. "Comptroller SetTreasuryData 0x.. 0x.. 1e18
      `,
      "SetTreasuryData",
      [
        new Arg("comptroller", getComptroller, { implicit: true }),
        new Arg("guardian", getAddressV),
        new Arg("address", getAddressV),
        new Arg("percent", getNumberV),
      ],
      (world, from, { comptroller, guardian, address, percent }) =>
        setTreasuryData(world, from, comptroller, guardian.val, address.val, percent),
    ),
  ];
}

export async function processComptrollerEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("Comptroller", comptrollerCommands(), world, event, from);
}
