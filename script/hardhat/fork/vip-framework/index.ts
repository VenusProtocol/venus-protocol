import { loadFixture, mine, mineUpTo } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, ContractInterface } from "ethers";
import { ethers } from "hardhat";

import { Proposal } from "./types";
import { getCalldatas, initMainnetUser, setForkBlock } from "./utils";

const DEFAULT_PROPOSER_ADDRESS = "0x55A9f5374Af30E3045FB491f1da3C2E8a74d168D";
const DEFAULT_SUPPORTER_ADDRESS = "0xc444949e0054a23c44fc45789738bdf64aed2391";
const GOVERNOR_PROXY = "0x2d56dC077072B53571b8252008C60e945108c75a";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const NORMAL_TIMELOCK_DELAY = 172800;
const VOTING_PERIOD = 28800;

export const forking = (blockNumber: number, fn: () => void) => {
  describe(`At block #${blockNumber}`, () => {
    before(async () => {
      await setForkBlock(blockNumber);
    });
    fn();
  });
};

export interface TestingOptions {
  governorAbi?: ContractInterface;
  proposer?: string;
  supporter?: string;
  callbackAfterExecution?: Func;
}

const executeCommand = async (timelock: SignerWithAddress, proposal: Proposal, commandIdx: number): Promise<void> => {
  const iface = new ethers.utils.Interface([`function ${proposal.signatures[commandIdx]}`]);
  await timelock.sendTransaction({
    to: proposal.targets[commandIdx],
    value: proposal.values[commandIdx],
    data: iface.encodeFunctionData(proposal.signatures[commandIdx], proposal.params[commandIdx]),
    gasLimit: 8000000,
  });
};

export const pretendExecutingVip = async (proposal: Proposal) => {
  const impersonatedTimelock = await initMainnetUser(NORMAL_TIMELOCK, ethers.utils.parseEther("1.0"));
  for (let i = 0; i < proposal.signatures.length; ++i) {
    await executeCommand(impersonatedTimelock, proposal, i);
  }
};

export const testVip = (description: string, proposal: Proposal, options: TestingOptions = {}) => {
  let impersonatedTimelock: SignerWithAddress;
  let governorProxy: Contract;
  let proposer: SignerWithAddress;
  let supporter: SignerWithAddress;

  const governanceFixture = async (): Promise<void> => {
    const proposerAddress = options.proposer ?? DEFAULT_PROPOSER_ADDRESS;
    const supporterAddress = options.supporter ?? DEFAULT_SUPPORTER_ADDRESS;
    proposer = await initMainnetUser(proposerAddress, ethers.utils.parseEther("1.0"));
    supporter = await initMainnetUser(supporterAddress, ethers.utils.parseEther("1.0"));
    impersonatedTimelock = await initMainnetUser(NORMAL_TIMELOCK, ethers.utils.parseEther("1.0"));

    // Iniitalize impl via Proxy
    governorProxy = await ethers.getContractAt(options.governorAbi ?? "GovernorBravoDelegate", GOVERNOR_PROXY);
  };

  describe(`${description} commands`, () => {
    before(async () => {
      await loadFixture(governanceFixture);
    });

    proposal.signatures.map((signature, i) => {
      it(`executes ${signature} successfully`, async () => {
        await executeCommand(impersonatedTimelock, proposal, i);
      });
    });
  });

  describe(`${description} execution`, () => {
    before(async () => {
      await loadFixture(governanceFixture);
    });

    let proposalId: number;

    it("can be proposed", async () => {
      const { targets, signatures, values, meta } = proposal;
      const proposalIdBefore = await governorProxy.callStatic.proposalCount();
      let tx;
      if (proposal.type === undefined || proposal.type === null) {
        tx = await governorProxy
          .connect(proposer)
          .propose(targets, values, signatures, getCalldatas(proposal), JSON.stringify(meta));
      } else {
        tx = await governorProxy
          .connect(proposer)
          .propose(targets, values, signatures, getCalldatas(proposal), JSON.stringify(meta), proposal.type);
      }
      await tx.wait();
      proposalId = await governorProxy.callStatic.proposalCount();
      expect(proposalIdBefore.add(1)).to.equal(proposalId);
    });

    it("should be voteable", async () => {
      await mine();
      await expect(governorProxy.connect(proposer).castVote(proposalId, 1)).to.emit(governorProxy, "VoteCast");
      await expect(governorProxy.connect(supporter).castVote(proposalId, 1)).to.emit(governorProxy, "VoteCast");
    });

    it("should be queued sucessfully", async () => {
      await mineUpTo((await ethers.provider.getBlockNumber()) + VOTING_PERIOD + 1);
      const tx = await governorProxy.connect(proposer).queue(proposalId);
      await tx.wait();
    });

    it("should be executed successfully", async () => {
      await mineUpTo((await ethers.provider.getBlockNumber()) + NORMAL_TIMELOCK_DELAY);
      const tx = await governorProxy.connect(proposer).execute(proposalId);
      const txResponse = await tx.wait();

      if (options.callbackAfterExecution) {
        await options.callbackAfterExecution(txResponse);
      }
    });
  });
};
