import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  IAccessControlManager,
  IAccessControlManagerV5__factory,
  IProtocolShareReserve,
  InterestRateModel,
  VBep20Delegate,
  VBep20Delegate__factory,
  VBep20Delegator,
  VBep20Delegator__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

let vBusd: VBep20Delegate;
let vBusdProxy: VBep20Delegator;
let accessControlManager: IAccessControlManager;
let impersonatedTimelock: SignerWithAddress;

const VBUSD = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D";
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
const INTEREST_RATE_MODEL = "0x8612b1330575d3f2f792329C5c16d55f22433c3F";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";

async function grantPermission(signature: string) {
  await accessControlManager.giveCallPermission(VBUSD, `${signature}`, NORMAL_TIMELOCK);
}

async function configure() {
  impersonatedTimelock = await initMainnetUser(NORMAL_TIMELOCK, ethers.utils.parseUnits("2"));
  accessControlManager = IAccessControlManagerV5__factory.connect(ACM, impersonatedTimelock);

  vBusdProxy = VBep20Delegator__factory.connect(VBUSD, impersonatedTimelock);

  const vTokenFactory = await ethers.getContractFactory("VBep20Delegate");
  const vBusdImpl = await vTokenFactory.deploy();
  await vBusdImpl.deployed();

  await vBusdProxy.connect(impersonatedTimelock)._setImplementation(vBusdImpl.address, true, "0x00");
  vBusd = VBep20Delegate__factory.connect(VBUSD, impersonatedTimelock);
  await vBusd.setAccessControlManager(ACM);
  const protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");
  await grantPermission("setReduceReservesBlockDelta(uint256)");
  await expect(vBusd.connect(impersonatedTimelock).setReduceReservesBlockDelta(0)).to.be.revertedWith("Invalid Input");
  await vBusd.connect(impersonatedTimelock).setReduceReservesBlockDelta(1000);
  await vBusd.connect(impersonatedTimelock).setProtocolShareReserve(protocolShareReserve.address);
}

const FORK_MAINNET = process.env.FORK === "true" && process.env.FORKED_NETWORK === "bscmainnet";

if (FORK_MAINNET) {
  describe("VToken ACM Upgrade", () => {
    let fakeInterestRateModel: FakeContract<InterestRateModel>;
    before(async () => {
      await setForkBlock(28089329);
      await configure();
      fakeInterestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
    });

    it("revert if permission not granted", async () => {
      await expect(vBusd.connect(impersonatedTimelock)._setReserveFactor(convertToUnit(1, 17))).to.be.revertedWith(
        "access denied",
      );
      await expect(vBusd.connect(impersonatedTimelock)._reduceReserves(convertToUnit(1, 17))).to.be.revertedWith(
        "access denied",
      );
      await expect(
        vBusd.connect(impersonatedTimelock)._setInterestRateModel(fakeInterestRateModel.address),
      ).to.be.revertedWith("access denied");
    });

    it("should success if permission is granted for reduce reserves", async () => {
      await grantPermission("_reduceReserves(uint256)");
      const reduceAmount = await vBusd.totalReserves();
      await expect(vBusd.connect(impersonatedTimelock)._reduceReserves(reduceAmount)).to.be.emit(
        vBusd,
        "ReservesReduced",
      );
    });

    it("should success if permission is granted for set new reserve factor", async () => {
      await grantPermission("_setReserveFactor(uint256)");
      const oldReserveFactor = await vBusd.reserveFactorMantissa();
      await expect(vBusd.connect(impersonatedTimelock)._setReserveFactor(convertToUnit(1, 16)))
        .to.be.emit(vBusd, "NewReserveFactor")
        .withArgs(oldReserveFactor, convertToUnit(1, 16));
    });

    it("should success if permission is granted for set new interest model", async () => {
      await grantPermission("_setInterestRateModel(address)");
      fakeInterestRateModel.isInterestRateModel.returns(true);
      await expect(vBusd.connect(impersonatedTimelock)._setInterestRateModel(fakeInterestRateModel.address))
        .to.be.emit(vBusd, "NewMarketInterestRateModel")
        .withArgs(INTEREST_RATE_MODEL, fakeInterestRateModel.address);
    });
  });
}
