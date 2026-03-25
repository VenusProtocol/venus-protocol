// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { approveOrRevert } from "../../lib/approveOrRevert.sol";
import { IVBep20 } from "../../InterfacesV8.sol";

interface IVBep20Admin {
    function _acceptAdmin() external returns (uint256);

    function _setPendingAdmin(address payable newPendingAdmin) external returns (uint256);

    function sweepTokenAndSync(uint256 transferAmount) external;
}

interface IVBnb {
    function repayBorrowBehalf(address borrower) external payable;

    function borrowBalanceCurrent(address account) external returns (uint256);
}

/// @title BadDebtHelper
/// @notice Atomically repays bad debt across 19 tokens + native BNB in the BSC Core Pool,
///         handles THE market recovery (sweep + repay + transfer), and returns remaining assets.
/// @dev The Normal Timelock sources tokens from Risk Fund / Treasury, transfers them to this
///      contract, sets this contract as pending admin on vTHE, then calls execute() with BNB value.
///      After execution, admin is handed back to the Normal Timelock.
contract BadDebtHelper {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @dev VToken return value signalling successful execution
    uint256 internal constant NO_ERROR = 0;

    /// @dev Tracks whether approval has been set for the current token being processed.
    ///      Set on first _repayToken call, reset by _finalizeToken.
    bool private _approved;

    // ──────────────────────────────────────────────────────────
    // Core addresses
    // ──────────────────────────────────────────────────────────
    address payable public constant NORMAL_TIMELOCK = payable(0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396);
    address public constant THE_TARGET_RECEIVER = 0x5e7BB1F600e42bc227755527895a282f782555ec;

    // ──────────────────────────────────────────────────────────
    // THE market
    // ──────────────────────────────────────────────────────────
    IERC20Upgradeable internal constant THE = IERC20Upgradeable(0xF4C8E32EaDEC4BFe97E0F595AdD0f4450a863a11);
    IVBep20 internal constant V_THE = IVBep20(0x86e06EAfa6A1eA631Eab51DE500E3D474933739f);

    // ──────────────────────────────────────────────────────────
    // Underlying tokens
    // ──────────────────────────────────────────────────────────
    IERC20Upgradeable internal constant ETH_TOKEN = IERC20Upgradeable(0x2170Ed0880ac9A755fd29B2688956BD959F933F8);
    IERC20Upgradeable internal constant USDT = IERC20Upgradeable(0x55d398326f99059fF775485246999027B3197955);
    IERC20Upgradeable internal constant WBNB = IERC20Upgradeable(0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c);
    IERC20Upgradeable internal constant BTCB = IERC20Upgradeable(0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c);
    IERC20Upgradeable internal constant CAKE = IERC20Upgradeable(0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);
    IERC20Upgradeable internal constant DAI = IERC20Upgradeable(0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3);
    IERC20Upgradeable internal constant XRP = IERC20Upgradeable(0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE);
    IERC20Upgradeable internal constant BCH = IERC20Upgradeable(0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf);
    IERC20Upgradeable internal constant LTC = IERC20Upgradeable(0x4338665CBB7B2485A8855A139b75D5e34AB0DB94);
    IERC20Upgradeable internal constant LINK = IERC20Upgradeable(0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD);
    IERC20Upgradeable internal constant ADA = IERC20Upgradeable(0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47);
    IERC20Upgradeable internal constant USDC = IERC20Upgradeable(0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d);
    IERC20Upgradeable internal constant AAVE = IERC20Upgradeable(0xfb6115445Bff7b52FeB98650C87f44907E58f802);
    IERC20Upgradeable internal constant DOGE = IERC20Upgradeable(0xbA2aE424d960c26247Dd6c32edC70B295c744C43);
    IERC20Upgradeable internal constant SXP = IERC20Upgradeable(0x47BEAd2563dCBf3bF2c9407fEa4dC236fAbA485A);
    IERC20Upgradeable internal constant FIL = IERC20Upgradeable(0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153);
    IERC20Upgradeable internal constant TUSD = IERC20Upgradeable(0x40af3827F39D0EAcBF4A168f8D4ee67c121D11c9);

    // ──────────────────────────────────────────────────────────
    // vTokens (Core Pool)
    // ──────────────────────────────────────────────────────────
    IVBep20 internal constant V_ETH = IVBep20(0xf508fCD89b8bd15579dc79A6827cB4686A3592c8);
    IVBep20 internal constant V_USDT = IVBep20(0xfD5840Cd36d94D7229439859C0112a4185BC0255);
    IVBep20 internal constant V_WBNB = IVBep20(0x6bCa74586218dB34cdB402295796b79663d816e9);
    IVBep20 internal constant V_BTC = IVBep20(0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B);
    IVBep20 internal constant V_CAKE = IVBep20(0x86aC3974e2BD0d60825230fa6F355fF11409df5c);
    IVBep20 internal constant V_DAI = IVBep20(0x334b3eCB4DCa3593BCCC3c7EBD1A1C1d1780FBF1);
    IVBep20 internal constant V_XRP = IVBep20(0xB248a295732e0225acd3337607cc01068e3b9c10);
    IVBep20 internal constant V_BCH = IVBep20(0x5F0388EBc2B94FA8E123F404b79cCF5f40b29176);
    IVBep20 internal constant V_LTC = IVBep20(0x57A5297F2cB2c0AaC9D554660acd6D385Ab50c6B);
    IVBep20 internal constant V_LINK = IVBep20(0x650b940a1033B8A1b1873f78730FcFC73ec11f1f);
    IVBep20 internal constant V_ADA = IVBep20(0x9A0AF7FDb2065Ce470D72664DE73cAE409dA28Ec);
    IVBep20 internal constant V_USDC = IVBep20(0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8);
    IVBep20 internal constant V_AAVE = IVBep20(0x26DA28954763B92139ED49283625ceCAf52C6f94);
    IVBep20 internal constant V_DOGE = IVBep20(0xec3422Ef92B2fb59e84c8B02Ba73F1fE84Ed8D71);
    IVBep20 internal constant V_SXP = IVBep20(0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0);
    IVBep20 internal constant V_FIL = IVBep20(0xf91d58b5aE142DAcC749f58A49FCBac340Cb0343);
    IVBep20 internal constant V_TUSD = IVBep20(0xBf762cd5991cA1DCdDaC9ae5C638F5B5Dc3Bee6E);
    IVBnb internal constant V_BNB = IVBnb(0xA07c5b74C9B40447a954e1466938b865b6BBea36);

    // ──────────────────────────────────────────────────────────
    // Borrower accounts
    // ──────────────────────────────────────────────────────────
    address internal constant ACCOUNT_1 = 0x1A35bD28EFD46CfC46c2136f878777D69ae16231;
    address internal constant ACCOUNT_3 = 0x489A8756C18C0b8B24EC2a2b9FF3D4d447F79BEc;
    address internal constant ACCOUNT_4 = 0x448ca4Bc5e3407Ce67bC9D7185cEf5B34C3ADEf8;
    address internal constant ACCOUNT_5 = 0x85ca0Dff027102ea3FBF1c077524eab21D1F7927;
    address internal constant ACCOUNT_6 = 0xdDBF9868D960FD2433BA762FAf46024881cd9916;
    address internal constant ACCOUNT_8 = 0x1dc0F176519Ec89adc2fa16d0fb1163AFD617C9C;
    address internal constant ACCOUNT_14 = 0xd4842aD6e4B96DE9c250857f0822897C5B283D0D;
    address internal constant ACCOUNT_15 = 0x73b6a7A6E39A2E405087164d7F407A0Bd2c86dcc;
    address internal constant ACCOUNT_16 = 0x2ee9D239DF727454D2BdF76AeA18F1c51aA196Cc;
    address internal constant ACCOUNT_17 = 0xd7b67276FC0ef1079331494139F40Fa3632d6125;
    address internal constant ACCOUNT_18 = 0x10e086957b9a5c0073f582AeEaDAed7C37f8df9d;
    address internal constant ACCOUNT_19 = 0x9454f17a6BcC36CFBC8A07011B33DaFCebE4050b;
    address internal constant ACCOUNT_20 = 0x0cEEDe04b0350e5251BA8919E131d60e3e063618;
    address internal constant ACCOUNT_21 = 0xbb81DA9040B0Ea33D56Cf29a688856b40A7B400c;
    address internal constant ACCOUNT_22 = 0xF942e8436918163590ec858279233A6f7EfCCd94;
    address internal constant ACCOUNT_23 = 0xe73d283293Efe2d9225825Bc7a382F7008244c2B;
    address internal constant ACCOUNT_24 = 0xc234723994B035CE916e8A02878163046Bc0940c;
    address internal constant ACCOUNT_25 = 0xB71D994B57594D9A61be011cFcf901E4aa36788F;
    address internal constant ACCOUNT_26 = 0x716Bab7286bE25CcE2Deb36e892056F4b4Ad07c9;
    address internal constant ACCOUNT_27 = 0x770F97E8562EB40a181151587C2e473A604a18F6;

    // ──────────────────────────────────────────────────────────
    // THE borrowers (from VIP-690)
    // ──────────────────────────────────────────────────────────
    address internal constant THE_BORROWER_1 = 0x737bc98F1D34E19539C074B8Ad1169d5d45dA619; // ACCOUNT_2
    address internal constant THE_BORROWER_2 = 0x85ca0Dff027102ea3FBF1c077524eab21D1F7927; // ACCOUNT_5
    address internal constant THE_BORROWER_3 = 0xA72e1756426100c6207421471449E2Ba9A917e86; // ACCOUNT_7
    address internal constant THE_BORROWER_4 = 0x9958Ed7f2441c208821Ea14643224812A006D221; // ACCOUNT_9
    address internal constant THE_BORROWER_5 = 0x6Efee96287B5e1a2Ef966E25baE15a54BDE9b83E; // ACCOUNT_10
    address internal constant THE_BORROWER_6 = 0x2C58D31559d65242cF7915A4Fd89fCAB9c96F7dF; // ACCOUNT_11
    address internal constant THE_BORROWER_7 = 0xDff9E1B12dFb7103231128940A19c2896f049de8; // ACCOUNT_12
    address internal constant THE_BORROWER_8 = 0xA87f0d31846211Ce417128a770C681fC342D3a74; // ACCOUNT_13

    // ──────────────────────────────────────────────────────────
    // Events & errors
    // ──────────────────────────────────────────────────────────
    event BadDebtRepaid(address indexed vToken, address indexed borrower, uint256 repayAmount);
    event RemainingTHETransferred(address indexed receiver, uint256 amount);
    event TokensReturnedToTimelock(address indexed token, uint256 amount);

    /// @notice Thrown when a VToken operation returns an error code
    error VTokenError(address vToken, uint256 errorCode);

    /// @notice Allows the Timelock to recover any token or BNB stuck in this contract.
    /// @param token The token to sweep (address(0) for BNB).
    /// @param amount The amount to sweep.
    function sweep(address token, uint256 amount) external {
        require(msg.sender == NORMAL_TIMELOCK, "only timelock");

        if (token == address(0)) {
            (bool success, ) = NORMAL_TIMELOCK.call{ value: amount }("");
            require(success, "BNB transfer failed");
        } else {
            IERC20Upgradeable(token).safeTransfer(NORMAL_TIMELOCK, amount);
        }
    }

    /// @notice Executes the full bad debt repayment flow atomically.
    /// @dev Preconditions:
    ///      - All BEP20 tokens have been transferred to this contract by the Timelock
    ///      - Native BNB has been sent via msg.value
    ///      - Timelock has called vTHE._setPendingAdmin(address(this))
    function execute() external payable {
        require(msg.sender == NORMAL_TIMELOCK, "only timelock");

        _repayTHE();
        _repayBEP20();
        _repayBNB();
    }

    // ══════════════════════════════════════════════════════════
    // Part 1: THE market recovery
    // ══════════════════════════════════════════════════════════

    function _repayTHE() internal {
        IVBep20Admin vTHEAdmin = IVBep20Admin(address(V_THE));

        // Accept admin of vTHE
        uint256 err = vTHEAdmin._acceptAdmin();
        if (err != NO_ERROR) revert VTokenError(address(V_THE), err);

        // Sweep all THE from vTHE (live balance)
        uint256 vTHEBalance = THE.balanceOf(address(V_THE));
        vTHEAdmin.sweepTokenAndSync(vTHEBalance);

        // Approve and repay THE bad debt
        approveOrRevert(THE, address(V_THE), type(uint256).max);

        _repayIfDebt(V_THE, THE_BORROWER_1);
        _repayIfDebt(V_THE, THE_BORROWER_2);
        _repayIfDebt(V_THE, THE_BORROWER_3);
        _repayIfDebt(V_THE, THE_BORROWER_4);
        _repayIfDebt(V_THE, THE_BORROWER_5);
        _repayIfDebt(V_THE, THE_BORROWER_6);
        _repayIfDebt(V_THE, THE_BORROWER_7);
        _repayIfDebt(V_THE, THE_BORROWER_8);

        approveOrRevert(THE, address(V_THE), 0);

        // Second sweep — recover THE that flowed back via repayments
        uint256 vTHEBalanceAfter = THE.balanceOf(address(V_THE));
        if (vTHEBalanceAfter > 0) {
            vTHEAdmin.sweepTokenAndSync(vTHEBalanceAfter);
        }

        // Transfer remaining THE to target receiver
        uint256 remainingTHE = THE.balanceOf(address(this));
        if (remainingTHE > 0) {
            THE.safeTransfer(THE_TARGET_RECEIVER, remainingTHE);
            emit RemainingTHETransferred(THE_TARGET_RECEIVER, remainingTHE);
        }

        // Hand admin back to Timelock
        err = vTHEAdmin._setPendingAdmin(NORMAL_TIMELOCK);
        if (err != NO_ERROR) revert VTokenError(address(V_THE), err);
    }

    // ══════════════════════════════════════════════════════════
    // Part 2: BEP20 token bad debt repayments
    // ══════════════════════════════════════════════════════════

    function _repayBEP20() internal {
        // ── ETH (from Risk Fund) ──
        _repayToken(ETH_TOKEN, V_ETH, ACCOUNT_3);
        _repayToken(ETH_TOKEN, V_ETH, ACCOUNT_6);
        _repayToken(ETH_TOKEN, V_ETH, ACCOUNT_15);
        _repayToken(ETH_TOKEN, V_ETH, ACCOUNT_23);
        _finalizeToken(ETH_TOKEN, V_ETH);

        // ── USDT (from Risk Fund) ──
        _repayToken(USDT, V_USDT, ACCOUNT_3);
        _repayToken(USDT, V_USDT, ACCOUNT_5);
        _repayToken(USDT, V_USDT, ACCOUNT_8);
        _repayToken(USDT, V_USDT, ACCOUNT_14);
        _repayToken(USDT, V_USDT, ACCOUNT_18);
        _repayToken(USDT, V_USDT, ACCOUNT_26);
        _finalizeToken(USDT, V_USDT);

        // ── WBNB (from Risk Fund) ──
        _repayToken(WBNB, V_WBNB, ACCOUNT_1);
        _finalizeToken(WBNB, V_WBNB);

        // ── BTCB (from Risk Fund) ──
        _repayToken(BTCB, V_BTC, ACCOUNT_1);
        _repayToken(BTCB, V_BTC, ACCOUNT_3);
        _repayToken(BTCB, V_BTC, ACCOUNT_14);
        _repayToken(BTCB, V_BTC, ACCOUNT_15);
        _finalizeToken(BTCB, V_BTC);

        // ── CAKE (from Treasury, partial — debt exceeds available balance) ──
        _repayToken(CAKE, V_CAKE, ACCOUNT_1);
        _finalizeToken(CAKE, V_CAKE);

        // ── DAI (from Treasury, partial — debt exceeds available balance for ACCOUNT_3) ──
        _repayToken(DAI, V_DAI, ACCOUNT_25);
        _repayToken(DAI, V_DAI, ACCOUNT_3);
        _finalizeToken(DAI, V_DAI);

        // ── XRP (from Treasury) ──
        _repayToken(XRP, V_XRP, ACCOUNT_15);
        _repayToken(XRP, V_XRP, ACCOUNT_16);
        _repayToken(XRP, V_XRP, ACCOUNT_17);
        _repayToken(XRP, V_XRP, ACCOUNT_19);
        _repayToken(XRP, V_XRP, ACCOUNT_20);
        _repayToken(XRP, V_XRP, ACCOUNT_21);
        _repayToken(XRP, V_XRP, ACCOUNT_22);
        _repayToken(XRP, V_XRP, ACCOUNT_23);
        _repayToken(XRP, V_XRP, ACCOUNT_24);
        _repayToken(XRP, V_XRP, ACCOUNT_25);
        _repayToken(XRP, V_XRP, ACCOUNT_26);
        _repayToken(XRP, V_XRP, ACCOUNT_27);
        _finalizeToken(XRP, V_XRP);

        // ── BCH (from Treasury) ──
        _repayToken(BCH, V_BCH, ACCOUNT_14);
        _repayToken(BCH, V_BCH, ACCOUNT_15);
        _finalizeToken(BCH, V_BCH);

        // ── LTC (from Treasury) ──
        _repayToken(LTC, V_LTC, ACCOUNT_21);
        _repayToken(LTC, V_LTC, ACCOUNT_23);
        _finalizeToken(LTC, V_LTC);

        // ── LINK (from Treasury) ──
        _repayToken(LINK, V_LINK, ACCOUNT_14);
        _finalizeToken(LINK, V_LINK);

        // ── ADA (from Treasury) ──
        _repayToken(ADA, V_ADA, ACCOUNT_19);
        _repayToken(ADA, V_ADA, ACCOUNT_21);
        _finalizeToken(ADA, V_ADA);

        // ── USDC (from Treasury) ──
        _repayToken(USDC, V_USDC, ACCOUNT_1);
        _repayToken(USDC, V_USDC, ACCOUNT_3);
        _repayToken(USDC, V_USDC, ACCOUNT_20);
        _finalizeToken(USDC, V_USDC);

        // ── AAVE (from Treasury) ──
        _repayToken(AAVE, V_AAVE, ACCOUNT_14);
        _finalizeToken(AAVE, V_AAVE);

        // ── DOGE (from Treasury) ──
        _repayToken(DOGE, V_DOGE, ACCOUNT_19);
        _finalizeToken(DOGE, V_DOGE);

        // ── SXP (from Treasury) ──
        _repayToken(SXP, V_SXP, ACCOUNT_17);
        _repayToken(SXP, V_SXP, ACCOUNT_20);
        _repayToken(SXP, V_SXP, ACCOUNT_21);
        _repayToken(SXP, V_SXP, ACCOUNT_22);
        _finalizeToken(SXP, V_SXP);

        // ── FIL (from Treasury) ──
        _repayToken(FIL, V_FIL, ACCOUNT_15);
        _finalizeToken(FIL, V_FIL);

        // ── TUSD (from Treasury) ──
        _repayToken(TUSD, V_TUSD, ACCOUNT_20);
        _finalizeToken(TUSD, V_TUSD);
    }

    // ══════════════════════════════════════════════════════════
    // Part 3: Native BNB bad debt repayments
    // ══════════════════════════════════════════════════════════

    function _repayBNB() internal {
        _repayBNBFor(ACCOUNT_1);
        _repayBNBFor(ACCOUNT_4);
        _repayBNBFor(ACCOUNT_14);
        _repayBNBFor(ACCOUNT_20);
        _repayBNBFor(ACCOUNT_23);

        // Return unused BNB to Timelock
        uint256 remainingBNB = address(this).balance;
        if (remainingBNB > 0) {
            (bool success, ) = NORMAL_TIMELOCK.call{ value: remainingBNB }("");
            require(success, "BNB transfer failed");
        }
    }

    function _repayBNBFor(address borrower) internal {
        uint256 debt = IVBnb(address(V_BNB)).borrowBalanceCurrent(borrower);
        if (debt == 0) return;

        V_BNB.repayBorrowBehalf{ value: debt }(borrower);
        emit BadDebtRepaid(address(V_BNB), borrower, debt);
    }

    // ══════════════════════════════════════════════════════════
    // Internal helpers
    // ══════════════════════════════════════════════════════════

    /// @dev Repays a borrower's debt. Uses type(uint256).max if the helper has enough tokens
    ///      to cover the full debt, otherwise repays with the available balance.
    ///      This prevents reverts when interest accrual during the timelock delay causes
    ///      the actual debt to slightly exceed the transferred amount.
    function _repayToken(IERC20Upgradeable underlying, IVBep20 vToken, address borrower) internal {
        if (!_approved) {
            approveOrRevert(underlying, address(vToken), type(uint256).max);
            _approved = true;
        }

        uint256 debt = vToken.borrowBalanceStored(borrower);
        if (debt == 0) return;

        uint256 balance = underlying.balanceOf(address(this));
        uint256 repayAmount = debt <= balance ? type(uint256).max : balance;

        uint256 err = vToken.repayBorrowBehalf(borrower, repayAmount);
        if (err != NO_ERROR) revert VTokenError(address(vToken), err);
        uint256 actualRepaid = balance - underlying.balanceOf(address(this));

        emit BadDebtRepaid(address(vToken), borrower, actualRepaid);
    }

    function _finalizeToken(IERC20Upgradeable underlying, IVBep20 vToken) internal {
        approveOrRevert(underlying, address(vToken), 0);
        _approved = false;

        // Return unused tokens to Timelock
        uint256 remaining = underlying.balanceOf(address(this));
        if (remaining > 0) {
            underlying.safeTransfer(NORMAL_TIMELOCK, remaining);
            emit TokensReturnedToTimelock(address(underlying), remaining);
        }
    }

    function _repayIfDebt(IVBep20 vToken, address borrower) internal {
        uint256 debt = vToken.borrowBalanceStored(borrower);
        if (debt == 0) return;

        uint256 balanceBefore = THE.balanceOf(address(this));
        uint256 err = vToken.repayBorrowBehalf(borrower, type(uint256).max);
        if (err != NO_ERROR) revert VTokenError(address(vToken), err);
        uint256 actualRepaid = balanceBefore - THE.balanceOf(address(this));

        emit BadDebtRepaid(address(vToken), borrower, actualRepaid);
    }

    receive() external payable {}
}
