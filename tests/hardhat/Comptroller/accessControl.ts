import {  Signer } from "ethers";
import { ethers } from "hardhat";
import {loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { smock, MockContract, FakeContract } from "@defi-wonderland/smock";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

describe("Comptroller", () => {
	// let accessControlManager: FakeContract<AccessControlmanager>
	// describe("Access Control",() => {

	// })
});