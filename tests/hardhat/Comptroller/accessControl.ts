import { Signer } from "ethers";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { smock, MockContract, FakeContract } from "@defi-wonderland/smock";
import chai from "chai";
import { Comptroller, Comptroller__factory, IAccessControlManager } from "../../../typechain";
const { expect } = chai;
chai.use(smock.matchers);

describe("Comptroller", () => {
  let comptroller: MockContract<Comptroller>;
  let accessControl: FakeContract<IAccessControlManager>;
    
  before(async () => {
	const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
	comptroller = await ComptrollerFactory.deploy();
	accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
	await comptroller._setAccessControl(accessControl.address);
  });
	
  describe("Access Control", () => {
	it.only("ACM address is set in storage", async () => {
		expect(await comptroller.getVariable("accessControl")).to.equal(accessControl.address);
	});
	
	describe("setCollateralFactor", async () => {

	});
	describe("setLiquidationIncentive", async () => {

	});
	describe("_setMarketBorrowCaps", async () => {

	});
	describe("setMarketSupplyCaps", async () => {

	});
	describe("setProtocolPaused", async () => {

	});
	describe("_setLiquidationIncentive", async () =>{

	});
  });
});
