import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  ComptrollerHarness,
  ComptrollerHarness__factory,
  EIP20Interface,
  IAccessControlManagerV5,
  VBep20Immutable,
} from "../../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("RewardFacet — vXVS market membership guard", () => {
  let user: SignerWithAddress;
  let comptroller: MockContract<ComptrollerHarness>;
  let xvs: FakeContract<EIP20Interface>;
  let vXVS: FakeContract<VBep20Immutable>;

  beforeEach(async () => {
    [, user] = await ethers.getSigners();

    const accessControl = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
    accessControl.isAllowedToCall.returns(true);

    const factory = await smock.mock<ComptrollerHarness__factory>("ComptrollerHarness");
    comptroller = await factory.deploy();
    await comptroller._setAccessControl(accessControl.address);

    xvs = await smock.fake<EIP20Interface>("contracts/Tokens/EIP20Interface.sol:EIP20Interface");
    vXVS = await smock.fake<VBep20Immutable>("contracts/Tokens/VTokens/VBep20Immutable.sol:VBep20Immutable");

    xvs.balanceOf.returns(parseUnits("1000000", 18));
    xvs.approve.returns(true);
    vXVS.underlying.returns(xvs.address);
    vXVS.mintBehalf.returns(0);
    vXVS.isVToken.returns(true);

    await comptroller._setXVSToken(xvs.address);
    await comptroller.harnessAddVtoken(vXVS.address);
    await comptroller._setXVSVToken(vXVS.address);
  });

  it("reverts when user has shortfall and has not entered the vXVS market", async () => {
    await expect(
      comptroller.harnessGrantXVSInternal(user.address, parseUnits("10", 18), parseUnits("100", 18), true),
    ).to.be.revertedWith("vXVS market not entered");
  });

  it("succeeds when user has shortfall and is already in the vXVS market", async () => {
    await comptroller.connect(user).enterMarkets([vXVS.address]);

    await comptroller.harnessGrantXVSInternal(user.address, parseUnits("10", 18), parseUnits("100", 18), true);

    expect(vXVS.mintBehalf).to.have.been.calledOnceWith(user.address, parseUnits("10", 18));
  });
});
