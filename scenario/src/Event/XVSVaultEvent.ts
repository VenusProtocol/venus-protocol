import { buildXVSVaultImpl } from "../Builder/XVSVaultImplBuilder";
import { Arg, Command, processCommandEvent } from "../Command";
import { XVSVault } from "../Contract/XVSVault";
import { getXVSVault } from "../ContractLookup";
import { getAddressV, getEventV, getNumberV } from "../CoreValue";
import { NoErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { AddressV, EventV, NumberV } from "../Value";
import { World, addAction } from "../World";

async function genXVSVault(world: World, from: string, params: Event): Promise<World> {
  const { world: nextWorld, xvsVaultImpl, xvsVaultData } = await buildXVSVaultImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed immutable XVS Vault (${xvsVaultImpl.name}) to address ${xvsVaultImpl._address}`,
    xvsVaultData.invokation,
  );

  return world;
}

async function delegate(world: World, from: string, xvsVault: XVSVault, account: string): Promise<World> {
  const invokation = await invoke(world, xvsVault.methods.delegate(account), from, NoErrorReporter);

  world = addAction(world, `"Delegated from" ${from} to ${account}`, invokation);

  return world;
}

async function setXvsStore(
  world: World,
  from: string,
  xvsVault: XVSVault,
  xvs: string,
  xvsStore: string,
): Promise<World> {
  const invokation = await invoke(world, xvsVault.methods.setXvsStore(xvs, xvsStore), from, NoErrorReporter);

  world = addAction(
    world,
    `Configured XVS=${xvs}, XVSStore=${xvsStore} in the XVSVault (${xvsVault._address})`,
    invokation,
  );

  return world;
}

async function addPool(
  world: World,
  from: string,
  xvsVault: XVSVault,
  rewardToken: string,
  allocPoint: NumberV,
  token: string,
  rewardPerBlock: NumberV,
  lockPeriod: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    xvsVault.methods.add(rewardToken, allocPoint.encode(), token, rewardPerBlock.encode(), lockPeriod.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `Added new (${token}, ${rewardToken}) pool to XVSVault (${xvsVault._address})`, invokation);

  return world;
}

async function deposit(
  world: World,
  from: string,
  xvsVault: XVSVault,
  rewardToken: string,
  pid: NumberV,
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    xvsVault.methods.deposit(rewardToken, pid.toNumber(), amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(
    world,
    `Deposited ${amount.toString()} tokens to pool (${rewardToken}, ${pid.toNumber()})
     in the XVSVault (${xvsVault._address})`,
    invokation,
  );

  return world;
}

async function requestWithdrawal(
  world: World,
  from: string,
  xvsVault: XVSVault,
  rewardToken: string,
  pid: NumberV,
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    xvsVault.methods.requestWithdrawal(rewardToken, pid.toNumber(), amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(
    world,
    `Requested withdrawal of ${amount.toString()} tokens from pool (${rewardToken}, ${pid.toNumber()})
     in the XVSVault (${xvsVault._address})`,
    invokation,
  );

  return world;
}

async function executeWithdrawal(
  world: World,
  from: string,
  xvsVault: XVSVault,
  rewardToken: string,
  pid: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    xvsVault.methods.executeWithdrawal(rewardToken, pid.toNumber()),
    from,
    NoErrorReporter,
  );

  world = addAction(
    world,
    `Executed withdrawal of tokens from pool (${rewardToken}, ${pid.toNumber()})
     in the XVSVault (${xvsVault._address})`,
    invokation,
  );

  return world;
}

async function setWithdrawalLockingPeriod(
  world: World,
  from: string,
  xvsVault: XVSVault,
  rewardToken: string,
  pid: NumberV,
  newPeriod: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    xvsVault.methods.setWithdrawalLockingPeriod(rewardToken, pid.toNumber(), newPeriod.toNumber()),
    from,
    NoErrorReporter,
  );

  world = addAction(
    world,
    `Set lock period to ${newPeriod.toString()} in the XVSVault (${xvsVault._address})`,
    invokation,
  );

  return world;
}

export function xvsVaultCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new XVS Vault (non-proxy version)
        * E.g. "XVSVault Deploy MyVaultImpl"
      `,
      "Deploy",
      [new Arg("params", getEventV, { variadic: true })],
      (world, from, { params }) => genXVSVault(world, from, params.val),
    ),

    new Command<{ xvsVault: XVSVault; account: AddressV }>(
      `
        #### Delegate

        * "XVSVault Delegate account:<Address>" - Delegates votes to a given account
        * E.g. "XVSVault Delegate Torrey"
      `,
      "Delegate",
      [new Arg("xvsVault", getXVSVault, { implicit: true }), new Arg("account", getAddressV)],
      (world, from, { xvsVault, account }) => delegate(world, from, xvsVault, account.val),
    ),

    new Command<{ xvsVault: XVSVault; xvs: AddressV; xvsStore: AddressV }>(
      `
        #### SetXvsStore

        * "XVSVault SetXvsStore xvs:<Address> xvsStore:<Address>" - Configures XVS and XVSStore addresses in the vault
        * E.g. "XVSVault SetXvsStore (Address XVS) (Address XVSStore)"
      `,
      "SetXvsStore",
      [
        new Arg("xvsVault", getXVSVault, { implicit: true }),
        new Arg("xvs", getAddressV),
        new Arg("xvsStore", getAddressV),
      ],
      (world, from, { xvsVault, xvs, xvsStore }) => setXvsStore(world, from, xvsVault, xvs.val, xvsStore.val),
    ),

    new Command<{
      xvsVault: XVSVault;
      rewardToken: AddressV;
      allocPoint: NumberV;
      token: AddressV;
      rewardPerBlock: NumberV;
      lockPeriod: NumberV;
    }>(
      `
        #### Add

        * "XVSVault Add rewardToken:<Address> allocPoint:<Number> token:<Address> rewardPerBlock:<Number>"
            - Adds a new token pool
        * E.g. "XVSVault Add (Address XVS) 1000 (Address XVS) 12345"
      `,
      "Add",
      [
        new Arg("xvsVault", getXVSVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("allocPoint", getNumberV),
        new Arg("token", getAddressV),
        new Arg("rewardPerBlock", getNumberV),
        new Arg("lockPeriod", getNumberV),
      ],
      (world, from, { xvsVault, rewardToken, allocPoint, token, rewardPerBlock, lockPeriod }) =>
        addPool(world, from, xvsVault, rewardToken.val, allocPoint, token.val, rewardPerBlock, lockPeriod),
    ),

    new Command<{
      xvsVault: XVSVault;
      rewardToken: AddressV;
      pid: NumberV;
      amount: NumberV;
    }>(
      `
        #### Deposit

        * "XVSVault Deposit rewardToken:<Address> pid:<Number> amount:<Number>"
            - Deposits tokens to the pool identified by (rewardToken, pid) pair
        * E.g. "XVSVault Deposit (Address XVS) 42 12345"
      `,
      "Deposit",
      [
        new Arg("xvsVault", getXVSVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("pid", getNumberV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { xvsVault, rewardToken, pid, amount }) =>
        deposit(world, from, xvsVault, rewardToken.val, pid, amount),
    ),

    new Command<{
      xvsVault: XVSVault;
      rewardToken: AddressV;
      pid: NumberV;
      amount: NumberV;
    }>(
      `
        #### RequestWithdrawal

        * "XVSVault RequestWithdrawal rewardToken:<Address> pid:<Number> amount:<Number>"
            - Submits a withdrawal request
        * E.g. "XVSVault RequestWithdrawal (Address XVS) 42 12345"
      `,
      "RequestWithdrawal",
      [
        new Arg("xvsVault", getXVSVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("pid", getNumberV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { xvsVault, rewardToken, pid, amount }) =>
        requestWithdrawal(world, from, xvsVault, rewardToken.val, pid, amount),
    ),

    new Command<{
      xvsVault: XVSVault;
      rewardToken: AddressV;
      pid: NumberV;
    }>(
      `
        #### ExecuteWithdrawal

        * "XVSVault ExecuteWithdrawal rewardToken:<Address> pid:<Number>"
            - Executes all requests eligible for withdrawal in a certain pool
        * E.g. "XVSVault ExecuteWithdrawal (Address XVS) 42"
      `,
      "ExecuteWithdrawal",
      [
        new Arg("xvsVault", getXVSVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("pid", getNumberV),
      ],
      (world, from, { xvsVault, rewardToken, pid }) => executeWithdrawal(world, from, xvsVault, rewardToken.val, pid),
    ),

    new Command<{
      xvsVault: XVSVault;
      rewardToken: AddressV;
      pid: NumberV;
      newPeriod: NumberV;
    }>(
      `
        #### SetWithdrawalLockingPeriod

        * "XVSVault SetWithdrawalLockingPeriod rewardToken:<Address> pid:<Number> newPeriod:<Number>"
            - Sets the locking period for withdrawals
        * E.g. "XVSVault SetWithdrawalLockingPeriod (Address XVS) 0 42"
      `,
      "SetWithdrawalLockingPeriod",
      [
        new Arg("xvsVault", getXVSVault, { implicit: true }),
        new Arg("rewardToken", getAddressV),
        new Arg("pid", getNumberV),
        new Arg("newPeriod", getNumberV),
      ],
      (world, from, { xvsVault, rewardToken, pid, newPeriod }) =>
        setWithdrawalLockingPeriod(world, from, xvsVault, rewardToken.val, pid, newPeriod),
    ),
  ];
}

export async function processXVSVaultEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("XVSVault", xvsVaultCommands(), world, event, from);
}
