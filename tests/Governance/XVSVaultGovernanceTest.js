const { address, bnbUnsigned, unlockedAccount } = require("../Utils/BSC");

const EIP712 = require("../Utils/EIP712");

describe("XVSVault governance", () => {
  const name = "XVSVault";

  let root, a1, a2, accounts, chainId; // eslint-disable-line @typescript-eslint/no-unused-vars
  let xvs, xvsVault, xvsStore;

  async function deployVault(root) {
    xvsVault = await deploy("XVSVault", []);
    xvsStore = await deploy("XVSStore", []);
    xvs = await deploy("XVSScenario", [root]);
    await send(xvsStore, "setNewOwner", [xvsVault._address], { from: root });
    await send(xvsVault, "setXvsStore", [xvs._address, xvsStore._address], { from: root });
    // address _rewardToken, uint256 _allocPoint, IBEP20 _token, uint256 _rewardPerBlock, uint256 _lockPeriod
    await send(xvsVault, "add", [xvs._address, 100, xvs._address, bnbUnsigned(1e16), 300], { from: root }); // lock period 300s
  }

  beforeEach(async () => {
    [root, a1, a2, ...accounts] = saddle.accounts;
    chainId = 1; // await web3.eth.net.getId(); See: https://github.com/trufflesuite/ganache-core/issues/515
    await deployVault(root);
  });

  describe("delegateBySig", () => {
    const Domain = xvsVault => ({ name, chainId, verifyingContract: xvsVault._address });
    const Types = {
      Delegation: [
        { name: "delegatee", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "expiry", type: "uint256" },
      ],
    };

    it("reverts if the signatory is invalid", async () => {
      const delegatee = root,
        nonce = 0,
        expiry = 0;
      await expect(send(xvsVault, "delegateBySig", [delegatee, nonce, expiry, 0, "0xbad", "0xbad"])).rejects.toRevert(
        "revert ECDSA: invalid signature 's' value",
      );
    });

    it("reverts if the nonce is bad ", async () => {
      const delegatee = root,
        nonce = 1,
        expiry = 0;
      const { v, r, s } = EIP712.sign(
        Domain(xvsVault),
        "Delegation",
        { delegatee, nonce, expiry },
        Types,
        unlockedAccount(a1).secretKey,
      );
      await expect(send(xvsVault, "delegateBySig", [delegatee, nonce, expiry, v, r, s])).rejects.toRevert(
        "revert XVSVault::delegateBySig: invalid nonce",
      );
    });

    it("reverts if the signature has expired", async () => {
      const delegatee = root,
        nonce = 0,
        expiry = 0;
      const { v, r, s } = EIP712.sign(
        Domain(xvsVault),
        "Delegation",
        { delegatee, nonce, expiry },
        Types,
        unlockedAccount(a1).secretKey,
      );
      await expect(send(xvsVault, "delegateBySig", [delegatee, nonce, expiry, v, r, s])).rejects.toRevert(
        "revert XVSVault::delegateBySig: signature expired",
      );
    });

    it("delegates on behalf of the signatory", async () => {
      const delegatee = root,
        nonce = 0,
        expiry = 10e9;
      const { v, r, s } = EIP712.sign(
        Domain(xvsVault),
        "Delegation",
        { delegatee, nonce, expiry },
        Types,
        unlockedAccount(a1).secretKey,
      );
      expect(await call(xvsVault, "delegates", [a1])).toEqual(address(0));
      const tx = await send(xvsVault, "delegateBySig", [delegatee, nonce, expiry, v, r, s]);
      expect(tx.gasUsed < 80000);
      expect(await call(xvsVault, "delegates", [a1])).toEqual(root);
    });
  });
});
