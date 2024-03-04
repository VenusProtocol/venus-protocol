import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";

import {
  ComptrollerHarness,
  ComptrollerHarness__factory,
  IAccessControlManagerV8,
  IProtocolShareReserve,
  InterestRateModelHarness,
  MockVBNB,
  MockVBNB__factory,
  VBNBAdmin,
  WBNB,
  WBNB__factory,
} from "../../../typechain";

export const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18

type SetupMarketFixture = {
  comptroller: MockContract<ComptrollerHarness>;
  vBNB: MockContract<MockVBNB>;
  protocolShareReserve: FakeContract<IProtocolShareReserve>;
  WBNB: MockContract<WBNB>;
  VBNBAdmin: VBNBAdmin;
  VBNBAdminAsVBNB: MockContract<MockVBNB>;
};

const setupMarketFixture = async (): Promise<SetupMarketFixture> => {
  const [admin] = await ethers.getSigners();

  const ComptrollerFactory = await smock.mock<ComptrollerHarness__factory>("ComptrollerHarness");
  const comptroller = await ComptrollerFactory.deploy();

  const interestRateModelHarnessFactory = await ethers.getContractFactory("InterestRateModelHarness");
  const InterestRateModelHarness = (await interestRateModelHarnessFactory.deploy(
    BigNumber.from(18).mul(5),
  )) as InterestRateModelHarness;

  const MockVBNBFactory = await smock.mock<MockVBNB__factory>("MockVBNB");

  const mockVBNB = await MockVBNBFactory.deploy(
    comptroller.address,
    InterestRateModelHarness.address,
    bigNumber18,
    "Venus BNB",
    "vBNB",
    18,
    admin.address,
  );

  const protocolShareReserve = await smock.fake<IProtocolShareReserve>(
    "contracts/InterfacesV8.sol:IProtocolShareReserve",
  );

  const WBNBFactory = await smock.mock<WBNB__factory>("WBNB");
  const WBNB = await WBNBFactory.deploy();

  const accessControl = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
  accessControl.isAllowedToCall.returns(true);

  const VBNBAdminFactory = await ethers.getContractFactory("VBNBAdmin");
  const VBNBAdmin: VBNBAdmin = await upgrades.deployProxy(
    VBNBAdminFactory,
    [protocolShareReserve.address, accessControl.address],
    {
      constructorArgs: [mockVBNB.address, WBNB.address],
    },
  );

  const VBNBAdminAsVBNB = await hre.ethers.getContractAt("MockVBNB", VBNBAdmin.address);

  return {
    comptroller,
    vBNB: mockVBNB,
    protocolShareReserve,
    WBNB,
    VBNBAdmin,
    VBNBAdminAsVBNB,
  };
};

describe("VBNBAdmin", () => {
  let vBNB: MockContract<MockVBNB>;
  let protocolShareReserve: FakeContract<IProtocolShareReserve>;
  let WBNB: MockContract<WBNB>;
  let VBNBAdmin: VBNBAdmin;
  let admin: Signer;
  let VBNBAdminAsVBNB: MockContract<MockVBNB>;

  beforeEach(async () => {
    [admin] = await ethers.getSigners();
    ({ vBNB, protocolShareReserve, WBNB, VBNBAdmin, VBNBAdminAsVBNB } = await loadFixture(setupMarketFixture));
  });

  it("set VBNBAdmin as vBNB admin", async () => {
    expect(await vBNB.admin()).to.be.equal(await admin.getAddress());

    await vBNB._setPendingAdmin(VBNBAdmin.address);

    await VBNBAdminAsVBNB._acceptAdmin();
    expect(await vBNB.admin()).to.be.equal(VBNBAdmin.address);
  });

  describe("harvest income", () => {
    beforeEach(async () => {
      await vBNB._setPendingAdmin(VBNBAdmin.address);
      await VBNBAdminAsVBNB._acceptAdmin();
    });

    it("reduce BNB reserves", async () => {
      const amount = ethers.utils.parseEther("1000");
      await vBNB.setTotalReserves(amount, { value: amount });
      let balance = await ethers.provider.getBalance(vBNB.address);
      expect(balance).to.be.equal(amount);

      await VBNBAdmin.reduceReserves(amount);

      balance = await ethers.provider.getBalance(vBNB.address);
      expect(balance).to.be.equal(0);
      balance = await ethers.provider.getBalance(VBNBAdmin.address);
      expect(balance).to.be.equal(0);
      balance = await WBNB.balanceOf(protocolShareReserve.address);
      expect(balance).to.be.equal(amount);
    });
  });
});
