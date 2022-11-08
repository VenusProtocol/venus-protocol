import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";

import {
  Comptroller,
  Comptroller__factory,
  IAccessControlManager,
  PriceOracle,
  VBep20Immutable,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

type PauseFixture = {
  accessControl: FakeContract<IAccessControlManager>;
  comptroller: MockContract<Comptroller>;
  oracle: FakeContract<PriceOracle>;
  OMG: FakeContract<VBep20Immutable>;
  ZRX: FakeContract<VBep20Immutable>;
  BAT: FakeContract<VBep20Immutable>;
  SKT: FakeContract<VBep20Immutable>;
  allTokens: FakeContract<VBep20Immutable>[];
  names: string[];
};

async function pauseFixture(): Promise<PauseFixture> {
  const accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
  const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
  const comptroller = await ComptrollerFactory.deploy();
  await comptroller._setAccessControl(accessControl.address);
  const oracle = await smock.fake<PriceOracle>("PriceOracle");

  accessControl.isAllowedToCall.returns(true);
  await comptroller._setPriceOracle(oracle.address);
  const names = ["OMG", "ZRX", "BAT", "sketch"];
  const [OMG, ZRX, BAT, SKT] = await Promise.all(
    names.map(async name => {
      const vToken = await smock.fake<VBep20Immutable>("VBep20Immutable");
      if (name !== "sketch") {
        await comptroller._supportMarket(vToken.address);
      }
      return vToken;
    }),
  );
  const allTokens = [OMG, ZRX, BAT];
  return { accessControl, comptroller, oracle, OMG, ZRX, BAT, SKT, allTokens, names };
}

function configure({ accessControl, allTokens, names }: PauseFixture) {
  accessControl.isAllowedToCall.reset();
  accessControl.isAllowedToCall.returns(true);
  allTokens.map((vToken, i) => {
    vToken.isVToken.returns(true);
    vToken.symbol.returns(names[i]);
    vToken.name.returns(names[i]);
    vToken.getAccountSnapshot.returns([0, 0, 0, 0]);
  });
}

describe("Comptroller", () => {
  let comptroller: MockContract<Comptroller>;
  let OMG: FakeContract<VBep20Immutable>;
  let ZRX: FakeContract<VBep20Immutable>;
  let BAT: FakeContract<VBep20Immutable>;
  let SKT: FakeContract<VBep20Immutable>;

  beforeEach(async () => {
    const contracts = await loadFixture(pauseFixture);
    configure(contracts);
    ({ comptroller, OMG, ZRX, BAT, SKT } = contracts);
  });

  describe("_setActionsPaused", () => {
    it("reverts if the market is not listed", async () => {
      await expect(comptroller._setActionsPaused([SKT.address], [1], true)).to.be.revertedWith("market not listed");
    });

    it("does nothing if the actions list is empty", async () => {
      await comptroller._setActionsPaused([OMG.address, ZRX.address], [], true);
      expect(await comptroller.actionPaused(OMG.address, 1)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 2)).to.equal(false);
    });

    it("does nothing if the markets list is empty", async () => {
      await comptroller._setActionsPaused([], [1, 2, 3, 4, 5], true);
      expect(await comptroller.actionPaused(OMG.address, 1)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 2)).to.equal(false);
    });

    it("can pause one action on several markets", async () => {
      await comptroller._setActionsPaused([OMG.address, BAT.address], [1], true);
      expect(await comptroller.actionPaused(OMG.address, 1)).to.equal(true);
      expect(await comptroller.actionPaused(ZRX.address, 1)).to.equal(false);
      expect(await comptroller.actionPaused(BAT.address, 1)).to.equal(true);
    });

    it("can pause several actions on one market", async () => {
      await comptroller._setActionsPaused([OMG.address], [3, 5, 6], true);
      expect(await comptroller.actionPaused(OMG.address, 3)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 4)).to.equal(false);
      expect(await comptroller.actionPaused(OMG.address, 5)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 6)).to.equal(true);
    });

    it("can pause and unpause several actions on several markets", async () => {
      await comptroller._setActionsPaused([OMG.address, BAT.address, ZRX.address], [3, 4, 5, 6], true);
      await comptroller._setActionsPaused([ZRX.address, BAT.address], [3, 5], false);
      expect(await comptroller.actionPaused(OMG.address, 3)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 4)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 5)).to.equal(true);
      expect(await comptroller.actionPaused(OMG.address, 6)).to.equal(true);
      expect(await comptroller.actionPaused(ZRX.address, 3)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 4)).to.equal(true);
      expect(await comptroller.actionPaused(ZRX.address, 5)).to.equal(false);
      expect(await comptroller.actionPaused(ZRX.address, 6)).to.equal(true);
      expect(await comptroller.actionPaused(BAT.address, 3)).to.equal(false);
      expect(await comptroller.actionPaused(BAT.address, 4)).to.equal(true);
      expect(await comptroller.actionPaused(BAT.address, 5)).to.equal(false);
      expect(await comptroller.actionPaused(BAT.address, 6)).to.equal(true);
    });
  });
});
