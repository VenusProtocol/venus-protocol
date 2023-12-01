import { FakeContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";

import {
  Comptroller,
  ComptrollerMock__factory,
  IAccessControlManagerV8,
  IProtocolShareReserve,
  MockVBNB,
  MockVBNB__factory,
  VBNBAdmin,
  WBNB,
  WBNB__factory,
} from "../../../typechain";
import { forking } from "./utils";

const COMPTROLLER_ADDRESS = "0xfd36e2c2a6789db23113685031d7f16329158384";
const vBNB_ADDRESS = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";

type SetupMarketFixture = {
  comptroller: Comptroller;
  vBNB: MockVBNB;
  protocolShareReserve: FakeContract<IProtocolShareReserve>;
  WBNB: WBNB;
  VBNBAdmin: VBNBAdmin;
  VBNBAdminAsVBNB: MockVBNB;
  normalTimelock: Signer;
};

const setupMarketFixture = async (): Promise<SetupMarketFixture> => {
  impersonateAccount(NORMAL_TIMELOCK);

  const [admin] = await ethers.getSigners();

  const comptroller = ComptrollerMock__factory.connect(COMPTROLLER_ADDRESS, admin);
  const vBNB = MockVBNB__factory.connect(vBNB_ADDRESS, admin);
  const WBNB = WBNB__factory.connect(WBNB_ADDRESS, admin);

  const protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");

  const accessControl = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
  accessControl.isAllowedToCall.returns(true);

  const VBNBAdminFactory = await ethers.getContractFactory("VBNBAdmin");
  const VBNBAdmin: VBNBAdmin = await upgrades.deployProxy(
    VBNBAdminFactory,
    [protocolShareReserve.address, accessControl.address],
    {
      constructorArgs: [vBNB.address, WBNB.address],
    },
  );

  const VBNBAdminAsVBNB = MockVBNB__factory.connect(VBNBAdmin.address, admin);

  return {
    comptroller,
    vBNB,
    protocolShareReserve,
    WBNB,
    VBNBAdmin,
    VBNBAdminAsVBNB,
    normalTimelock: await ethers.getSigner(NORMAL_TIMELOCK),
  };
};

const FORK_MAINNET = process.env.FORK === "true" && process.env.FORKED_NETWORK === "bscmainnet";

if (FORK_MAINNET) {
  const blockNumber = 29244056;
  forking(blockNumber, () => {
    describe("VBNBAdmin", () => {
      let vBNB: MockVBNB;
      let protocolShareReserve: FakeContract<IProtocolShareReserve>;
      let WBNB: WBNB;
      let VBNBAdmin: VBNBAdmin;
      let VBNBAdminAsVBNB: MockVBNB;
      let normalTimelock: Signer;

      beforeEach(async () => {
        ({ vBNB, protocolShareReserve, WBNB, VBNBAdmin, VBNBAdminAsVBNB, normalTimelock } = await loadFixture(
          setupMarketFixture,
        ));
      });

      it("set VBNBAdmin as vBNB admin", async () => {
        expect(await vBNB.admin()).to.be.equal(NORMAL_TIMELOCK);

        await vBNB.connect(normalTimelock)._setPendingAdmin(VBNBAdmin.address);

        await VBNBAdminAsVBNB._acceptAdmin();
        expect(await vBNB.admin()).to.be.equal(VBNBAdmin.address);
      });

      describe("harvest income", () => {
        beforeEach(async () => {
          await vBNB.connect(normalTimelock)._setPendingAdmin(VBNBAdmin.address);
          await VBNBAdminAsVBNB._acceptAdmin();
        });

        it("reduce BNB reserves", async () => {
          const amount = await vBNB.totalReserves();
          await VBNBAdmin.reduceReserves(amount); //4869.449631532919221682

          let balance = await vBNB.totalReserves();
          expect(balance).to.be.equal("366663102033709224"); //0.366663102033709224
          balance = await ethers.provider.getBalance(VBNBAdmin.address);
          expect(balance).to.be.equal(0);
          balance = await WBNB.balanceOf(protocolShareReserve.address);
          expect(balance).to.be.equal(amount);
        });
      });
    });
  });
}
