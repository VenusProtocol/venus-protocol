import { defaultAbiCoder } from "@ethersproject/abi";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { NumberLike } from "@nomicfoundation/hardhat-network-helpers/dist/src/types";
import { expect } from "chai";
import { ContractInterface, TransactionResponse } from "ethers";
import { ParamType } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { Command, Proposal, ProposalMeta, ProposalType } from "./types";

export async function setForkBlock(blockNumber: number) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.BSC_ARCHIVE_NODE_URL,
          blockNumber: blockNumber,
        },
      },
    ],
  });
}

export function getCalldatas({ signatures, params }: { signatures: string[]; params: any[][] }) {
  return params.map((args: any[], i: number) => {
    const types = getArgs(signatures[i]);
    return defaultAbiCoder.encode(types, args);
  });
}

const formatParamType = (paramType: ParamType): string => {
  if (paramType.type === "tuple") {
    return `tuple(${paramType.components.map(formatParamType).join(", ")})`;
  }

  if (paramType.type === "tuple[]") {
    return `tuple(${paramType.components.map(formatParamType).join(", ")})[]`;
  }

  return paramType.type;
};

const getArgs = (signature: string) => {
  if (signature === "") return [];
  const fragment = ethers.utils.FunctionFragment.from(signature);

  return fragment.inputs.map(formatParamType);
};

export const initMainnetUser = async (user: string, balance: NumberLike) => {
  await impersonateAccount(user);
  await setBalance(user, balance);
  return ethers.getSigner(user);
};

export const makeProposal = (commands: Command[], meta: ProposalMeta, type: ProposalType): Proposal => {
  return {
    signatures: commands.map(cmd => cmd.signature),
    targets: commands.map(cmd => cmd.target),
    params: commands.map(cmd => cmd.params),
    values: commands.map(cmd => cmd.value ?? "0"),
    meta,
    type,
  };
};

export const setMaxStalePeriodInOracle = async (
  comptrollerAddress: string,
  maxStalePeriodInSeconds: number = 31536000 /* 1 year */,
) => {
  const comptroller = await ethers.getContractAt("ComptrollerInterface", comptrollerAddress);
  const oracle = await ethers.getContractAt("VenusChainlinkOracle", await comptroller.oracle());
  const oracleAdmin = await initMainnetUser(await oracle.admin(), ethers.utils.parseEther("1.0"));

  const tx = await oracle.connect(oracleAdmin).setMaxStalePeriod(maxStalePeriodInSeconds);
  await tx.wait();
};

export const expectEvents = async (
  txResponse: TransactionResponse,
  abis: ContractInterface[],
  expectedEvents: string[],
  expectedCounts: number[],
) => {
  const getNamedEvents = (abi: ContractInterface) => {
    const iface = new ethers.utils.Interface(abi);
    return txResponse.events
      .map(it => {
        try {
          return iface.parseLog(it).name;
        } catch (error) {
          error; // shhh
        }
      })
      .filter(Boolean);
  };

  const namedEvents = abis.flatMap(getNamedEvents);

  for (let i = 0; i < expectedEvents.length; ++i) {
    expect(
      namedEvents.filter(it => it === expectedEvents[i]),
      `expected a differnt number of ${expectedEvents[i]} events`,
    ).to.have.lengthOf(expectedCounts[i]);
  }
};
