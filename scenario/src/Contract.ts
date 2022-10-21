import * as crypto from "crypto";
import * as path from "path";
import { AbiItem } from "web3-utils";

import { readFile } from "./File";
import { Invokation } from "./Invokation";
import { World } from "./World";

export interface Raw {
  data: string;
  topics: string[];
}

export interface Event {
  event: string;
  signature: string | null;
  address: string;
  returnValues: object;
  logIndex: number;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  raw: Raw;
}

export interface Contract {
  address: string;
  _address: string;
  name: string;
  methods: any;
  _jsonInterface: AbiItem[];
  constructorAbi?: string;
  getPastEvents: (event: string, options: { filter: object; fromBlock: number; toBlock: number | string }) => Event[];
}

function randomAddress(): string {
  return crypto.randomBytes(20).toString("hex");
}

class ContractStub {
  name: string;
  test: boolean;

  constructor(name: string, test: boolean) {
    this.name = name;
    this.test = test;
  }

  async deploy<T>(world: World, from: string, args: any[]): Promise<Invokation<T>> {
    // XXXS Consider opts
    // ( world.web3.currentProvider && typeof(world.web3.currentProvider) !== 'string' && world.web3.currentProvider.opts ) ||
    const opts = { from: from };

    const invokationOpts = world.getInvokationOpts(opts);

    const networkContractABI = await world.saddle.abi(this.name);
    const constructorAbi = networkContractABI.find(x => x.type === "constructor");
    let inputs;

    if (constructorAbi) {
      inputs = constructorAbi.inputs;
    } else {
      inputs = [];
    }

    try {
      let contract;
      let receipt;

      if (world.dryRun) {
        const addr = randomAddress();
        console.log(`Dry run: Deploying ${this.name} at fake address ${addr}`);
        contract = new world.web3.eth.Contract(<any>networkContractABI, addr);
        receipt = {
          blockNumber: -1,
          transactionHash: "0x",
          events: {},
        };
      } else {
        ({ contract, receipt } = await world.saddle.deployFull(this.name, args, invokationOpts, world.web3));
        contract.constructorAbi = world.web3.eth.abi.encodeParameters(inputs, args);
      }

      return new Invokation<T>(contract, receipt, null, null);
    } catch (err) {
      return new Invokation<T>(null, null, err, null);
    }
  }

  async at<T>(world: World, address: string): Promise<T> {
    const networkContractABI = await world.saddle.abi(this.name);

    // XXXS unknown?
    return <T>(<unknown>new world.web3.eth.Contract(<any>networkContractABI, address));
  }
}

export function getContract(name: string): ContractStub {
  return new ContractStub(name, false);
}

export function getTestContract(name: string): ContractStub {
  return new ContractStub(name, true);
}

export function setContractName(name: string, contract: Contract): Contract {
  contract.name = name;

  return contract;
}

export async function getPastEvents(
  world: World,
  contract: Contract,
  name: string,
  event: string,
  filter: object = {},
): Promise<Event[]> {
  const block = world.getIn(["contractData", "Blocks", name]);
  if (!block) {
    throw new Error(`Cannot get events when missing deploy block for ${name}`);
  }

  return await contract.getPastEvents(event, { filter: filter, fromBlock: block, toBlock: "latest" });
}

export async function decodeCall(world: World, contract: Contract, input: string): Promise<World> {
  if (input.slice(0, 2) === "0x") {
    input = input.slice(2);
  }

  const functionSignature = input.slice(0, 8);
  const argsEncoded = input.slice(8);

  const funsMapped = contract._jsonInterface.reduce((acc, fun) => {
    if (fun.type === "function") {
      const functionAbi = `${fun.name}(${(fun.inputs || []).map(i => i.type).join(",")})`;
      const sig = world.web3.utils.sha3(functionAbi)?.slice(2, 10);

      if (!sig) {
        return acc;
      }

      return {
        ...acc,
        [sig]: fun,
      };
    } else {
      return acc;
    }
  }, {});

  const abi = funsMapped[functionSignature];

  if (!abi) {
    throw new Error(`Cannot find function matching signature ${functionSignature}`);
  }

  const decoded = world.web3.eth.abi.decodeParameters(abi.inputs, argsEncoded);

  const args = abi.inputs.map(input => {
    return `${input.name}=${decoded[input.name]}`;
  });
  world.printer.printLine(`\n${contract.name}.${abi.name}(\n\t${args.join("\n\t")}\n)`);

  return world;
}

export async function getNetworkContracts(world: World): Promise<{ networkContracts: object; version: string }> {
  const basePath = world.basePath || "";

  const contractsPath = path.join(basePath, ".build", `contracts.json`);
  const fullContracts = await readFile(world, contractsPath, null, JSON.parse);
  const version = fullContracts.version;
  const networkContracts = Object.entries(fullContracts.contracts).reduce((acc, [k, v]) => {
    const [path, contractName] = k.split(":");

    return {
      ...acc,
      [contractName]: {
        ...(<object>v), /// XXXS TODO
        path: path,
      },
    };
  }, {});

  return {
    networkContracts,
    version,
  };
}
