import { expect } from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { WBNBSwapHelper } from "../../../typechain";
import { WBNB } from "../../../typechain/contracts/test/WBNB";

describe("WBNBSwapHelper", () => {
  let user1: Signer;
  let collateralSwapper: Signer;
  let wbnbSwapHelper: WBNBSwapHelper;
  let WBNB: WBNB;

  beforeEach(async () => {
    [user1, collateralSwapper] = await ethers.getSigners();

    const WBNBFactory = await ethers.getContractFactory("WBNB");
    WBNB = await WBNBFactory.deploy();

    const WBNBSwapHelperFactory = await ethers.getContractFactory("WBNBSwapHelper");
    wbnbSwapHelper = await WBNBSwapHelperFactory.deploy(WBNB.address, await collateralSwapper.getAddress());
  });

  it("should wrap native BNB into WBNB and transfer to CollateralSwapper", async () => {
    const amount = parseUnits("1", 18);
    await expect(await WBNB.balanceOf(await collateralSwapper.getAddress())).to.equals(0);
    await expect(
      wbnbSwapHelper
        .connect(collateralSwapper)
        .swapInternal(ethers.constants.AddressZero, ethers.constants.AddressZero, amount, { value: amount }),
    )
      .to.emit(wbnbSwapHelper, "SwappedToWBNB")
      .withArgs(amount);
    await expect(await WBNB.balanceOf(await collateralSwapper.getAddress())).to.equals(amount);
  });

  it("should revert if sent value does not match amount", async () => {
    const amount = parseUnits("1", 18);
    const mismatchedValue = parseUnits("0.5", 18);

    await expect(
      wbnbSwapHelper
        .connect(collateralSwapper)
        .swapInternal(ethers.constants.AddressZero, ethers.constants.AddressZero, amount, { value: mismatchedValue }),
    ).to.be.revertedWithCustomError(wbnbSwapHelper, "ValueMismatch");
  });

  it("should revert if non-zero tokenFrom is passed", async () => {
    const amount = parseUnits("1", 18);
    const fakeToken = await user1.getAddress();

    await expect(
      wbnbSwapHelper
        .connect(collateralSwapper)
        .swapInternal(fakeToken, ethers.constants.AddressZero, amount, { value: amount }),
    ).to.be.revertedWithCustomError(wbnbSwapHelper, "OnlyNativeSupported");
  });

  it("should revert if caller is not CollateralSwapper", async () => {
    const amount = parseUnits("1", 18);

    await expect(
      wbnbSwapHelper
        .connect(user1)
        .swapInternal(ethers.constants.AddressZero, ethers.constants.AddressZero, amount, { value: amount }),
    ).to.be.revertedWithCustomError(wbnbSwapHelper, "Unauthorized");
  });
});
