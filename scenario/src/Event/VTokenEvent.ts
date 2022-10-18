import { buildVToken } from "../Builder/VTokenBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { decodeCall, getPastEvents } from "../Contract";
import { getContract } from "../Contract";
import { VBep20Delegate } from "../Contract/VBep20Delegate";
import { VBep20Delegator } from "../Contract/VBep20Delegator";
import { VToken, VTokenScenario } from "../Contract/VToken";
import { getComptroller, getVTokenData } from "../ContractLookup";
import { getAddressV, getBoolV, getEventV, getExpNumberV, getNumberV, getStringV } from "../CoreValue";
import { VTokenErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { Sendable, invoke } from "../Invokation";
import { AddressV, BoolV, EventV, NothingV, NumberV, StringV } from "../Value";
import { getLiquidity } from "../Value/ComptrollerValue";
import { getVBep20DelegatorV, getVTokenV } from "../Value/VTokenValue";
import { verify } from "../Verify";
import { World, addAction, describeUser } from "../World";

function showTrxValue(world: World): string {
  return new NumberV(world.trxInvokationOpts.get("value")).show();
}

async function genVToken(world: World, from: string, event: Event): Promise<World> {
  const { world: nextWorld, vToken, tokenData } = await buildVToken(world, from, event);
  world = nextWorld;

  world = addAction(
    world,
    `Added vToken ${tokenData.name} (${tokenData.contract}<decimals=${tokenData.decimals}>) at address ${vToken._address}`,
    tokenData.invokation,
  );

  return world;
}

async function accrueInterest(world: World, from: string, vToken: VToken): Promise<World> {
  const invokation = await invoke(world, vToken.methods.accrueInterest(), from, VTokenErrorReporter);

  world = addAction(world, `VToken ${vToken.name}: Interest accrued`, invokation);

  return world;
}

async function mint(world: World, from: string, vToken: VToken, amount: NumberV | NothingV): Promise<World> {
  let invokation;
  let showAmount;

  if (amount instanceof NumberV) {
    showAmount = amount.show();
    invokation = await invoke(world, vToken.methods.mint(amount.encode()), from, VTokenErrorReporter);
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(world, vToken.methods.mint(), from, VTokenErrorReporter);
  }

  world = addAction(world, `VToken ${vToken.name}: ${describeUser(world, from)} mints ${showAmount}`, invokation);

  return world;
}

async function mintBehalf(
  world: World,
  from: string,
  vToken: VToken,
  receiver: string,
  amount: NumberV | NothingV,
): Promise<World> {
  let invokation;
  let showAmount;

  if (amount instanceof NumberV) {
    showAmount = amount.show();
    invokation = await invoke(world, vToken.methods.mintBehalf(receiver, amount.encode()), from, VTokenErrorReporter);
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(world, vToken.methods.mintBehalf(receiver), from, VTokenErrorReporter);
  }

  world = addAction(world, `VToken ${vToken.name}: ${describeUser(world, from)} mints ${showAmount}`, invokation);

  return world;
}

async function redeem(world: World, from: string, vToken: VToken, tokens: NumberV): Promise<World> {
  const invokation = await invoke(world, vToken.methods.redeem(tokens.encode()), from, VTokenErrorReporter);

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} redeems ${tokens.show()} tokens`,
    invokation,
  );

  return world;
}

async function redeemUnderlying(world: World, from: string, vToken: VToken, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, vToken.methods.redeemUnderlying(amount.encode()), from, VTokenErrorReporter);

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} redeems ${amount.show()} underlying`,
    invokation,
  );

  return world;
}

async function borrow(world: World, from: string, vToken: VToken, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, vToken.methods.borrow(amount.encode()), from, VTokenErrorReporter);

  world = addAction(world, `VToken ${vToken.name}: ${describeUser(world, from)} borrows ${amount.show()}`, invokation);

  return world;
}

async function repayBorrow(world: World, from: string, vToken: VToken, amount: NumberV | NothingV): Promise<World> {
  let invokation;
  let showAmount;

  if (amount instanceof NumberV) {
    showAmount = amount.show();
    invokation = await invoke(world, vToken.methods.repayBorrow(amount.encode()), from, VTokenErrorReporter);
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(world, vToken.methods.repayBorrow(), from, VTokenErrorReporter);
  }

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} repays ${showAmount} of borrow`,
    invokation,
  );

  return world;
}

async function repayBorrowBehalf(
  world: World,
  from: string,
  behalf: string,
  vToken: VToken,
  amount: NumberV | NothingV,
): Promise<World> {
  let invokation;
  let showAmount;

  if (amount instanceof NumberV) {
    showAmount = amount.show();
    invokation = await invoke(
      world,
      vToken.methods.repayBorrowBehalf(behalf, amount.encode()),
      from,
      VTokenErrorReporter,
    );
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(world, vToken.methods.repayBorrowBehalf(behalf), from, VTokenErrorReporter);
  }

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} repays ${showAmount} of borrow on behalf of ${describeUser(
      world,
      behalf,
    )}`,
    invokation,
  );

  return world;
}

async function liquidateBorrow(
  world: World,
  from: string,
  vToken: VToken,
  borrower: string,
  collateral: VToken,
  repayAmount: NumberV | NothingV,
): Promise<World> {
  let invokation;
  let showAmount;

  if (repayAmount instanceof NumberV) {
    showAmount = repayAmount.show();
    invokation = await invoke(
      world,
      vToken.methods.liquidateBorrow(borrower, repayAmount.encode(), collateral._address),
      from,
      VTokenErrorReporter,
    );
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(
      world,
      vToken.methods.liquidateBorrow(borrower, collateral._address),
      from,
      VTokenErrorReporter,
    );
  }

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} liquidates ${showAmount} from of ${describeUser(
      world,
      borrower,
    )}, seizing ${collateral.name}.`,
    invokation,
  );

  return world;
}

async function seize(
  world: World,
  from: string,
  vToken: VToken,
  liquidator: string,
  borrower: string,
  seizeTokens: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    vToken.methods.seize(liquidator, borrower, seizeTokens.encode()),
    from,
    VTokenErrorReporter,
  );

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} initiates seizing ${seizeTokens.show()} to ${describeUser(
      world,
      liquidator,
    )} from ${describeUser(world, borrower)}.`,
    invokation,
  );

  return world;
}

async function evilSeize(
  world: World,
  from: string,
  vToken: VToken,
  treasure: VToken,
  liquidator: string,
  borrower: string,
  seizeTokens: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    vToken.methods.evilSeize(treasure._address, liquidator, borrower, seizeTokens.encode()),
    from,
    VTokenErrorReporter,
  );

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(
      world,
      from,
    )} initiates illegal seizing ${seizeTokens.show()} to ${describeUser(world, liquidator)} from ${describeUser(
      world,
      borrower,
    )}.`,
    invokation,
  );

  return world;
}

async function setPendingAdmin(world: World, from: string, vToken: VToken, newPendingAdmin: string): Promise<World> {
  const invokation = await invoke(world, vToken.methods._setPendingAdmin(newPendingAdmin), from, VTokenErrorReporter);

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} sets pending admin to ${newPendingAdmin}`,
    invokation,
  );

  return world;
}

async function acceptAdmin(world: World, from: string, vToken: VToken): Promise<World> {
  const invokation = await invoke(world, vToken.methods._acceptAdmin(), from, VTokenErrorReporter);

  world = addAction(world, `VToken ${vToken.name}: ${describeUser(world, from)} accepts admin`, invokation);

  return world;
}

async function addReserves(world: World, from: string, vToken: VToken, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, vToken.methods._addReserves(amount.encode()), from, VTokenErrorReporter);

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} adds to reserves by ${amount.show()}`,
    invokation,
  );

  return world;
}

async function reduceReserves(world: World, from: string, vToken: VToken, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, vToken.methods._reduceReserves(amount.encode()), from, VTokenErrorReporter);

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} reduces reserves by ${amount.show()}`,
    invokation,
  );

  return world;
}

async function setReserveFactor(world: World, from: string, vToken: VToken, reserveFactor: NumberV): Promise<World> {
  const invokation = await invoke(
    world,
    vToken.methods._setReserveFactor(reserveFactor.encode()),
    from,
    VTokenErrorReporter,
  );

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} sets reserve factor to ${reserveFactor.show()}`,
    invokation,
  );

  return world;
}

async function setInterestRateModel(
  world: World,
  from: string,
  vToken: VToken,
  interestRateModel: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    vToken.methods._setInterestRateModel(interestRateModel),
    from,
    VTokenErrorReporter,
  );

  world = addAction(
    world,
    `Set interest rate for ${vToken.name} to ${interestRateModel} as ${describeUser(world, from)}`,
    invokation,
  );

  return world;
}

async function setComptroller(world: World, from: string, vToken: VToken, comptroller: string): Promise<World> {
  const invokation = await invoke(world, vToken.methods._setComptroller(comptroller), from, VTokenErrorReporter);

  world = addAction(
    world,
    `Set comptroller for ${vToken.name} to ${comptroller} as ${describeUser(world, from)}`,
    invokation,
  );

  return world;
}

async function becomeImplementation(
  world: World,
  from: string,
  vToken: VToken,
  becomeImplementationData: string,
): Promise<World> {
  const vBep20Delegate = getContract("VBep20Delegate");
  const vBep20DelegateContract = await vBep20Delegate.at<VBep20Delegate>(world, vToken._address);

  const invokation = await invoke(
    world,
    vBep20DelegateContract.methods._becomeImplementation(becomeImplementationData),
    from,
    VTokenErrorReporter,
  );

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(
      world,
      from,
    )} initiates _becomeImplementation with data:${becomeImplementationData}.`,
    invokation,
  );

  return world;
}

async function resignImplementation(world: World, from: string, vToken: VToken): Promise<World> {
  const vBep20Delegate = getContract("VBep20Delegate");
  const vBep20DelegateContract = await vBep20Delegate.at<VBep20Delegate>(world, vToken._address);

  const invokation = await invoke(
    world,
    vBep20DelegateContract.methods._resignImplementation(),
    from,
    VTokenErrorReporter,
  );

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(world, from)} initiates _resignImplementation.`,
    invokation,
  );

  return world;
}

async function setImplementation(
  world: World,
  from: string,
  vToken: VBep20Delegator,
  implementation: string,
  allowResign: boolean,
  becomeImplementationData: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    vToken.methods._setImplementation(implementation, allowResign, becomeImplementationData),
    from,
    VTokenErrorReporter,
  );

  world = addAction(
    world,
    `VToken ${vToken.name}: ${describeUser(
      world,
      from,
    )} initiates setImplementation with implementation:${implementation} allowResign:${allowResign} data:${becomeImplementationData}.`,
    invokation,
  );

  return world;
}

async function donate(world: World, from: string, vToken: VToken): Promise<World> {
  const invokation = await invoke(world, vToken.methods.donate(), from, VTokenErrorReporter);

  world = addAction(
    world,
    `Donate for ${vToken.name} as ${describeUser(world, from)} with value ${showTrxValue(world)}`,
    invokation,
  );

  return world;
}

async function setVTokenMock(
  world: World,
  from: string,
  vToken: VTokenScenario,
  mock: string,
  value: NumberV,
): Promise<World> {
  let mockMethod: (number) => Sendable<void>;

  switch (mock.toLowerCase()) {
    case "totalborrows":
      mockMethod = vToken.methods.setTotalBorrows;
      break;
    case "totalreserves":
      mockMethod = vToken.methods.setTotalReserves;
      break;
    default:
      throw new Error(`Mock "${mock}" not defined for vToken`);
  }

  const invokation = await invoke(world, mockMethod(value.encode()), from);

  world = addAction(world, `Mocked ${mock}=${value.show()} for ${vToken.name}`, invokation);

  return world;
}

async function verifyVToken(
  world: World,
  vToken: VToken,
  name: string,
  contract: string,
  apiKey: string,
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, name, contract, vToken._address);
  }

  return world;
}

async function printMinters(world: World, vToken: VToken): Promise<World> {
  const events = await getPastEvents(world, vToken, vToken.name, "Mint");
  const addresses = events.map(event => event.returnValues["minter"]);
  const uniq = [...new Set(addresses)];

  world.printer.printLine("Minters:");

  uniq.forEach(address => {
    world.printer.printLine(`\t${address}`);
  });

  return world;
}

async function printBorrowers(world: World, vToken: VToken): Promise<World> {
  const events = await getPastEvents(world, vToken, vToken.name, "Borrow");
  const addresses = events.map(event => event.returnValues["borrower"]);
  const uniq = [...new Set(addresses)];

  world.printer.printLine("Borrowers:");

  uniq.forEach(address => {
    world.printer.printLine(`\t${address}`);
  });

  return world;
}

async function printLiquidity(world: World, vToken: VToken): Promise<World> {
  const mintEvents = await getPastEvents(world, vToken, vToken.name, "Mint");
  const mintAddresses = mintEvents.map(event => event.returnValues["minter"]);
  const borrowEvents = await getPastEvents(world, vToken, vToken.name, "Borrow");
  const borrowAddresses = borrowEvents.map(event => event.returnValues["borrower"]);
  const uniq = [...new Set(mintAddresses.concat(borrowAddresses))];
  const comptroller = await getComptroller(world);

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

export function vTokenCommands() {
  return [
    new Command<{ vTokenParams: EventV }>(
      `
        #### Deploy

        * "VToken Deploy ...vTokenParams" - Generates a new VToken
          * E.g. "VToken vZRX Deploy"
      `,
      "Deploy",
      [new Arg("vTokenParams", getEventV, { variadic: true })],
      (world, from, { vTokenParams }) => genVToken(world, from, vTokenParams.val),
    ),
    new View<{ vTokenArg: StringV; apiKey: StringV }>(
      `
        #### Verify

        * "VToken <vToken> Verify apiKey:<String>" - Verifies VToken in BscScan
          * E.g. "VToken vZRX Verify "myApiKey"
      `,
      "Verify",
      [new Arg("vTokenArg", getStringV), new Arg("apiKey", getStringV)],
      async (world, { vTokenArg, apiKey }) => {
        const [vToken, name, data] = await getVTokenData(world, vTokenArg.val);

        return await verifyVToken(world, vToken, name, data.get("contract")!, apiKey.val);
      },
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken }>(
      `
        #### AccrueInterest

        * "VToken <vToken> AccrueInterest" - Accrues interest for given token
          * E.g. "VToken vZRX AccrueInterest"
      `,
      "AccrueInterest",
      [new Arg("vToken", getVTokenV)],
      (world, from, { vToken }) => accrueInterest(world, from, vToken),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; amount: NumberV | NothingV }>(
      `
        #### Mint

        * "VToken <vToken> Mint amount:<Number>" - Mints the given amount of vToken as specified user
          * E.g. "VToken vZRX Mint 1.0e18"
      `,
      "Mint",
      [new Arg("vToken", getVTokenV), new Arg("amount", getNumberV, { nullable: true })],
      (world, from, { vToken, amount }) => mint(world, from, vToken, amount),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; receiver: AddressV; amount: NumberV | NothingV }>(
      `
        #### MintBehalf

        * "VToken <vToken> MintBehalf receiver:<User> amount:<Number>" - Mints the given amount of vToken as specified user
          * E.g. "VToken vZRX MintBehalf Torrey 1.0e18"
      `,
      "MintBehalf",
      [
        new Arg("vToken", getVTokenV),
        new Arg("receiver", getAddressV),
        new Arg("amount", getNumberV, { nullable: true }),
      ],
      (world, from, { vToken, receiver, amount }) => mintBehalf(world, from, vToken, receiver.val, amount),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; tokens: NumberV }>(
      `
        #### Redeem

        * "VToken <vToken> Redeem tokens:<Number>" - Redeems the given amount of vTokens as specified user
          * E.g. "VToken vZRX Redeem 1.0e9"
      `,
      "Redeem",
      [new Arg("vToken", getVTokenV), new Arg("tokens", getNumberV)],
      (world, from, { vToken, tokens }) => redeem(world, from, vToken, tokens),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; amount: NumberV }>(
      `
        #### RedeemUnderlying

        * "VToken <vToken> RedeemUnderlying amount:<Number>" - Redeems the given amount of underlying as specified user
          * E.g. "VToken vZRX RedeemUnderlying 1.0e18"
      `,
      "RedeemUnderlying",
      [new Arg("vToken", getVTokenV), new Arg("amount", getNumberV)],
      (world, from, { vToken, amount }) => redeemUnderlying(world, from, vToken, amount),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; amount: NumberV }>(
      `
        #### Borrow

        * "VToken <vToken> Borrow amount:<Number>" - Borrows the given amount of this vToken as specified user
          * E.g. "VToken vZRX Borrow 1.0e18"
      `,
      "Borrow",
      [new Arg("vToken", getVTokenV), new Arg("amount", getNumberV)],
      // Note: we override from
      (world, from, { vToken, amount }) => borrow(world, from, vToken, amount),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; amount: NumberV | NothingV }>(
      `
        #### RepayBorrow

        * "VToken <vToken> RepayBorrow underlyingAmount:<Number>" - Repays borrow in the given underlying amount as specified user
          * E.g. "VToken vZRX RepayBorrow 1.0e18"
      `,
      "RepayBorrow",
      [new Arg("vToken", getVTokenV), new Arg("amount", getNumberV, { nullable: true })],
      (world, from, { vToken, amount }) => repayBorrow(world, from, vToken, amount),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; behalf: AddressV; amount: NumberV | NothingV }>(
      `
        #### RepayBorrowBehalf

        * "VToken <vToken> RepayBorrowBehalf behalf:<User> underlyingAmount:<Number>" - Repays borrow in the given underlying amount on behalf of another user
          * E.g. "VToken vZRX RepayBorrowBehalf Geoff 1.0e18"
      `,
      "RepayBorrowBehalf",
      [
        new Arg("vToken", getVTokenV),
        new Arg("behalf", getAddressV),
        new Arg("amount", getNumberV, { nullable: true }),
      ],
      (world, from, { vToken, behalf, amount }) => repayBorrowBehalf(world, from, behalf.val, vToken, amount),
      { namePos: 1 },
    ),
    new Command<{ borrower: AddressV; vToken: VToken; collateral: VToken; repayAmount: NumberV | NothingV }>(
      `
        #### Liquidate

        * "VToken <vToken> Liquidate borrower:<User> vTokenCollateral:<Address> repayAmount:<Number>" - Liquidates repayAmount of given token seizing collateral token
          * E.g. "VToken vZRX Liquidate Geoff vBAT 1.0e18"
      `,
      "Liquidate",
      [
        new Arg("vToken", getVTokenV),
        new Arg("borrower", getAddressV),
        new Arg("collateral", getVTokenV),
        new Arg("repayAmount", getNumberV, { nullable: true }),
      ],
      (world, from, { borrower, vToken, collateral, repayAmount }) =>
        liquidateBorrow(world, from, vToken, borrower.val, collateral, repayAmount),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; liquidator: AddressV; borrower: AddressV; seizeTokens: NumberV }>(
      `
        #### Seize

        * "VToken <vToken> Seize liquidator:<User> borrower:<User> seizeTokens:<Number>" - Seizes a given number of tokens from a user (to be called from other VToken)
          * E.g. "VToken vZRX Seize Geoff Torrey 1.0e18"
      `,
      "Seize",
      [
        new Arg("vToken", getVTokenV),
        new Arg("liquidator", getAddressV),
        new Arg("borrower", getAddressV),
        new Arg("seizeTokens", getNumberV),
      ],
      (world, from, { vToken, liquidator, borrower, seizeTokens }) =>
        seize(world, from, vToken, liquidator.val, borrower.val, seizeTokens),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; treasure: VToken; liquidator: AddressV; borrower: AddressV; seizeTokens: NumberV }>(
      `
        #### EvilSeize

        * "VToken <vToken> EvilSeize treasure:<Token> liquidator:<User> borrower:<User> seizeTokens:<Number>" - Improperly seizes a given number of tokens from a user
          * E.g. "VToken vEVL EvilSeize vZRX Geoff Torrey 1.0e18"
      `,
      "EvilSeize",
      [
        new Arg("vToken", getVTokenV),
        new Arg("treasure", getVTokenV),
        new Arg("liquidator", getAddressV),
        new Arg("borrower", getAddressV),
        new Arg("seizeTokens", getNumberV),
      ],
      (world, from, { vToken, treasure, liquidator, borrower, seizeTokens }) =>
        evilSeize(world, from, vToken, treasure, liquidator.val, borrower.val, seizeTokens),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; amount: NumberV }>(
      `
        #### ReduceReserves

        * "VToken <vToken> ReduceReserves amount:<Number>" - Reduces the reserves of the vToken
          * E.g. "VToken vZRX ReduceReserves 1.0e18"
      `,
      "ReduceReserves",
      [new Arg("vToken", getVTokenV), new Arg("amount", getNumberV)],
      (world, from, { vToken, amount }) => reduceReserves(world, from, vToken, amount),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; amount: NumberV }>(
      `
    #### AddReserves

    * "VToken <vToken> AddReserves amount:<Number>" - Adds reserves to the vToken
      * E.g. "VToken vZRX AddReserves 1.0e18"
  `,
      "AddReserves",
      [new Arg("vToken", getVTokenV), new Arg("amount", getNumberV)],
      (world, from, { vToken, amount }) => addReserves(world, from, vToken, amount),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; newPendingAdmin: AddressV }>(
      `
        #### SetPendingAdmin

        * "VToken <vToken> SetPendingAdmin newPendingAdmin:<Address>" - Sets the pending admin for the vToken
          * E.g. "VToken vZRX SetPendingAdmin Geoff"
      `,
      "SetPendingAdmin",
      [new Arg("vToken", getVTokenV), new Arg("newPendingAdmin", getAddressV)],
      (world, from, { vToken, newPendingAdmin }) => setPendingAdmin(world, from, vToken, newPendingAdmin.val),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken }>(
      `
        #### AcceptAdmin

        * "VToken <vToken> AcceptAdmin" - Accepts admin for the vToken
          * E.g. "From Geoff (VToken vZRX AcceptAdmin)"
      `,
      "AcceptAdmin",
      [new Arg("vToken", getVTokenV)],
      (world, from, { vToken }) => acceptAdmin(world, from, vToken),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; reserveFactor: NumberV }>(
      `
        #### SetReserveFactor

        * "VToken <vToken> SetReserveFactor reserveFactor:<Number>" - Sets the reserve factor for the vToken
          * E.g. "VToken vZRX SetReserveFactor 0.1"
      `,
      "SetReserveFactor",
      [new Arg("vToken", getVTokenV), new Arg("reserveFactor", getExpNumberV)],
      (world, from, { vToken, reserveFactor }) => setReserveFactor(world, from, vToken, reserveFactor),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; interestRateModel: AddressV }>(
      `
        #### SetInterestRateModel

        * "VToken <vToken> SetInterestRateModel interestRateModel:<Contract>" - Sets the interest rate model for the given vToken
          * E.g. "VToken vZRX SetInterestRateModel (FixedRate 1.5)"
      `,
      "SetInterestRateModel",
      [new Arg("vToken", getVTokenV), new Arg("interestRateModel", getAddressV)],
      (world, from, { vToken, interestRateModel }) => setInterestRateModel(world, from, vToken, interestRateModel.val),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; comptroller: AddressV }>(
      `
        #### SetComptroller

        * "VToken <vToken> SetComptroller comptroller:<Contract>" - Sets the comptroller for the given vToken
          * E.g. "VToken vZRX SetComptroller Comptroller"
      `,
      "SetComptroller",
      [new Arg("vToken", getVTokenV), new Arg("comptroller", getAddressV)],
      (world, from, { vToken, comptroller }) => setComptroller(world, from, vToken, comptroller.val),
      { namePos: 1 },
    ),
    new Command<{
      vToken: VToken;
      becomeImplementationData: StringV;
    }>(
      `
        #### BecomeImplementation

        * "VToken <vToken> BecomeImplementation becomeImplementationData:<String>"
          * E.g. "VToken vDAI BecomeImplementation "0x01234anyByTeS56789""
      `,
      "BecomeImplementation",
      [new Arg("vToken", getVTokenV), new Arg("becomeImplementationData", getStringV)],
      (world, from, { vToken, becomeImplementationData }) =>
        becomeImplementation(world, from, vToken, becomeImplementationData.val),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken }>(
      `
        #### ResignImplementation

        * "VToken <vToken> ResignImplementation"
          * E.g. "VToken vDAI ResignImplementation"
      `,
      "ResignImplementation",
      [new Arg("vToken", getVTokenV)],
      (world, from, { vToken }) => resignImplementation(world, from, vToken),
      { namePos: 1 },
    ),
    new Command<{
      vToken: VBep20Delegator;
      implementation: AddressV;
      allowResign: BoolV;
      becomeImplementationData: StringV;
    }>(
      `
        #### SetImplementation

        * "VToken <vToken> SetImplementation implementation:<Address> allowResign:<Bool> becomeImplementationData:<String>"
          * E.g. "VToken vDAI SetImplementation (VToken vDAIDelegate Address) True "0x01234anyByTeS56789"
      `,
      "SetImplementation",
      [
        new Arg("vToken", getVBep20DelegatorV),
        new Arg("implementation", getAddressV),
        new Arg("allowResign", getBoolV),
        new Arg("becomeImplementationData", getStringV),
      ],
      (world, from, { vToken, implementation, allowResign, becomeImplementationData }) =>
        setImplementation(world, from, vToken, implementation.val, allowResign.val, becomeImplementationData.val),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken }>(
      `
        #### Donate

        * "VToken <vToken> Donate" - Calls the donate (payable no-op) function
          * E.g. "(Trx Value 5.0e18 (VToken vBNB Donate))"
      `,
      "Donate",
      [new Arg("vToken", getVTokenV)],
      (world, from, { vToken }) => donate(world, from, vToken),
      { namePos: 1 },
    ),
    new Command<{ vToken: VToken; variable: StringV; value: NumberV }>(
      `
        #### Mock

        * "VToken <vToken> Mock variable:<String> value:<Number>" - Mocks a given value on vToken. Note: value must be a supported mock and this will only work on a "VTokenScenario" contract.
          * E.g. "VToken vZRX Mock totalBorrows 5.0e18"
          * E.g. "VToken vZRX Mock totalReserves 0.5e18"
      `,
      "Mock",
      [new Arg("vToken", getVTokenV), new Arg("variable", getStringV), new Arg("value", getNumberV)],
      (world, from, { vToken, variable, value }) =>
        setVTokenMock(world, from, <VTokenScenario>vToken, variable.val, value),
      { namePos: 1 },
    ),
    new View<{ vToken: VToken }>(
      `
        #### Minters

        * "VToken <vToken> Minters" - Print address of all minters
      `,
      "Minters",
      [new Arg("vToken", getVTokenV)],
      (world, { vToken }) => printMinters(world, vToken),
      { namePos: 1 },
    ),
    new View<{ vToken: VToken }>(
      `
        #### Borrowers

        * "VToken <vToken> Borrowers" - Print address of all borrowers
      `,
      "Borrowers",
      [new Arg("vToken", getVTokenV)],
      (world, { vToken }) => printBorrowers(world, vToken),
      { namePos: 1 },
    ),
    new View<{ vToken: VToken }>(
      `
        #### Liquidity

        * "VToken <vToken> Liquidity" - Prints liquidity of all minters or borrowers
      `,
      "Liquidity",
      [new Arg("vToken", getVTokenV)],
      (world, { vToken }) => printLiquidity(world, vToken),
      { namePos: 1 },
    ),
    new View<{ vToken: VToken; input: StringV }>(
      `
        #### Decode

        * "Decode <vToken> input:<String>" - Prints information about a call to a vToken contract
      `,
      "Decode",
      [new Arg("vToken", getVTokenV), new Arg("input", getStringV)],
      (world, { vToken, input }) => decodeCall(world, vToken, input.val),
      { namePos: 1 },
    ),
  ];
}

export async function processVTokenEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("VToken", vTokenCommands(), world, event, from);
}
