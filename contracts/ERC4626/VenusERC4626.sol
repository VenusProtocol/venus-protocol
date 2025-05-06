// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ERC4626Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

import { IProtocolShareReserve } from "../InterfacesV8.sol";
import { ComptrollerInterface, Action } from "./interfaces/ComptrollerInterface.sol";
import { VTokenInterface } from "./interfaces/VTokenInterface.sol";

/// @title VenusERC4626
/// @notice ERC4626 wrapper for Venus vTokens, enabling standard ERC4626 vault interactions with Venus Protocol.
contract VenusERC4626 is ERC4626Upgradeable, AccessControlledV8, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for ERC20Upgradeable;

    enum Rounding {
        Down,
        Up
    }

    /// @notice Error code representing no errors in Venus operations.
    uint256 internal constant NO_ERROR = 0;

    /// @notice Base unit for computations, usually used in scaling (multiplications, divisions)
    uint256 internal constant EXP_SCALE = 1e18;

    /// @notice The Venus vToken associated with this ERC4626 vault.
    VTokenInterface public vToken;

    /// @notice The Venus Comptroller contract, responsible for market operations.
    ComptrollerInterface public comptroller;

    /// @notice The recipient of rewards distributed by the Venus Protocol.
    address public rewardRecipient;

    /// @notice Emitted when rewards are claimed.
    /// @param amount The amount of reward tokens claimed.
    /// @param rewardToken The address of the reward token claimed.
    event ClaimRewards(uint256 amount, address indexed rewardToken);

    /// @notice Emitted when the reward recipient address is updated.
    /// @param oldRecipient The previous reward recipient address.
    /// @param newRecipient The new reward recipient address.
    event RewardRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    /// @notice Event emitted when tokens are swept
    event SweepToken(address indexed token, address indexed receiver, uint256 amount);

    /// @notice Thrown when a Venus protocol call returns an error.
    /// @dev This error is triggered if a Venus operation (such as minting or redeeming vTokens) fails.
    /// @param errorCode The error code returned by the Venus protocol.
    error VenusERC4626__VenusError(uint256 errorCode);

    /// @notice Thrown when a deposit exceeds the maximum allowed limit.
    /// @dev This error is triggered if the deposit amount is greater than `maxDeposit(receiver)`.
    error ERC4626__DepositMoreThanMax();

    /// @notice Thrown when a mint operation exceeds the maximum allowed limit.
    /// @dev This error is triggered if the mint amount is greater than `maxMint(receiver)`.
    error ERC4626__MintMoreThanMax();

    /// @notice Thrown when a withdrawal exceeds the maximum available assets.
    /// @dev This error is triggered if the withdrawal amount is greater than `maxWithdraw(owner)`.
    error ERC4626__WithdrawMoreThanMax();

    /// @notice Thrown when a redemption exceeds the maximum redeemable shares.
    /// @dev This error is triggered if the redemption amount is greater than `maxRedeem(owner)`.
    error ERC4626__RedeemMoreThanMax();

    /// @notice Thrown when attempting an operation with a zero amount.
    /// @dev This error prevents unnecessary transactions with zero amounts in deposit, withdraw, mint, or redeem operations.
    /// @param operation The name of the operation that failed (e.g., "deposit", "withdraw", "mint", "redeem").
    error ERC4626__ZeroAmount(string operation);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /// @notice Initializes the VenusERC4626 vault, only with the VToken address associated to the vault
    /// @dev `initialize2` should be invoked to complete the configuration of the vault
    /// @param vToken_ The VToken associated with the vault, representing the yield-bearing asset.
    function initialize(address vToken_) public initializer {
        ensureNonzeroAddress(vToken_);

        vToken = VTokenInterface(vToken_);
        comptroller = ComptrollerInterface(address(vToken.comptroller()));
        ERC20Upgradeable asset = ERC20Upgradeable(vToken.underlying());

        __ERC20_init(_generateVaultName(asset), _generateVaultSymbol(asset));
        __ERC4626_init(asset);
        __ReentrancyGuard_init();
    }

    /// @notice Sets a new reward recipient address
    /// @param newRecipient The address of the new reward recipient
    /// @custom:access Controlled by ACM
    function setRewardRecipient(address newRecipient) external {
        _checkAccessAllowed("setRewardRecipient(address)");
        _setRewardRecipient(newRecipient);
    }

    /// @notice Sweeps the input token address tokens from the contract and sends them to the owner
    /// @param token Address of the token
    /// @custom:event SweepToken emits on success
    /// @custom:access Only owner
    function sweepToken(IERC20Upgradeable token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));

        if (balance > 0) {
            address owner_ = owner();
            SafeERC20Upgradeable.safeTransfer(token, owner_, balance);
            emit SweepToken(address(token), owner_, balance);
        }
    }

    /// @notice Claims XVS rewards from Venus Core Pool and transfers them to rewardRecipient
    function claimRewards() external {
        comptroller.claimVenus(address(this));

        address xvsAddress = comptroller.getXVSAddress();
        IERC20Upgradeable xvs = IERC20Upgradeable(xvsAddress);
        uint256 rewardAmount = xvs.balanceOf(address(this));

        if (rewardAmount > 0) {
            SafeERC20Upgradeable.safeTransfer(xvs, rewardRecipient, rewardAmount);

            bytes memory data = abi.encodeCall(
                IProtocolShareReserve.updateAssetsState,
                (address(comptroller), xvsAddress, IProtocolShareReserve.IncomeType.ERC4626_WRAPPER_REWARDS)
            );
            rewardRecipient.call(data);

            emit ClaimRewards(rewardAmount, xvsAddress);
        }
    }

    /// @notice Second function to invoked to complete the configuration of the vault, setting the rest of the attributes
    /// @param accessControlManager_ Address of the ACM contract
    /// @param rewardRecipient_ The address that will receive rewards generated by the vault.
    /// @param vaultOwner_ The owner that will be set for the created vault
    function initialize2(
        address accessControlManager_,
        address rewardRecipient_,
        address vaultOwner_
    ) public reinitializer(2) {
        ensureNonzeroAddress(vaultOwner_);

        __AccessControlled_init(accessControlManager_);
        _setRewardRecipient(rewardRecipient_);
        _transferOwnership(vaultOwner_);
    }

    /// @inheritdoc ERC4626Upgradeable
    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
        ensureNonzeroAddress(receiver);

        vToken.accrueInterest();
        if (assets == 0) {
            revert ERC4626__ZeroAmount("deposit");
        }
        if (assets > maxDeposit(receiver)) {
            revert ERC4626__DepositMoreThanMax();
        }

        uint256 shares = previewDeposit(assets);
        if (shares == 0) {
            revert ERC4626__ZeroAmount("deposit");
        }
        _deposit(_msgSender(), receiver, assets, shares);
        afterDeposit(assets);
        return shares;
    }

    /// @inheritdoc ERC4626Upgradeable
    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
        ensureNonzeroAddress(receiver);

        vToken.accrueInterest();
        if (shares == 0) {
            revert ERC4626__ZeroAmount("mint");
        }
        if (shares > maxMint(receiver)) {
            revert ERC4626__MintMoreThanMax();
        }

        uint256 assets = previewMint(shares);
        if (assets == 0) {
            revert ERC4626__ZeroAmount("mint");
        }
        _deposit(_msgSender(), receiver, assets, shares);
        afterDeposit(assets);
        return assets;
    }

    /// @inheritdoc ERC4626Upgradeable
    function withdraw(uint256 assets, address receiver, address owner) public override nonReentrant returns (uint256) {
        ensureNonzeroAddress(receiver);
        ensureNonzeroAddress(owner);

        vToken.accrueInterest();
        if (assets == 0) {
            revert ERC4626__ZeroAmount("withdraw");
        }
        if (assets > maxWithdraw(owner)) {
            revert ERC4626__WithdrawMoreThanMax();
        }

        uint256 shares = previewWithdraw(assets);
        if (shares == 0) {
            revert ERC4626__ZeroAmount("withdraw");
        }
        uint256 actualAssets = beforeWithdraw(assets);
        _withdraw(_msgSender(), receiver, owner, actualAssets, shares);
        return shares;
    }

    /// @inheritdoc ERC4626Upgradeable
    function redeem(uint256 shares, address receiver, address owner) public override nonReentrant returns (uint256) {
        ensureNonzeroAddress(receiver);
        ensureNonzeroAddress(owner);

        vToken.accrueInterest();
        if (shares == 0) {
            revert ERC4626__ZeroAmount("redeem");
        }
        if (shares > maxRedeem(owner)) {
            revert ERC4626__RedeemMoreThanMax();
        }

        uint256 assets = previewRedeem(shares);
        if (assets == 0) {
            revert ERC4626__ZeroAmount("redeem");
        }

        // actualAssets should be equal to assets, because of the round performed in previewRedeem
        // but let's use the returned value anyway
        uint256 actualAssets = beforeWithdraw(assets);
        _withdraw(_msgSender(), receiver, owner, actualAssets, shares);
        return actualAssets;
    }

    /// @inheritdoc ERC4626Upgradeable
    function previewDeposit(uint256 assets) public view virtual override returns (uint256) {
        // round down the asset amount, to deposit an amont equivalent to a natural number of vTokens, without decimals
        uint256 adjustedAssets = _roundAssets(assets, Rounding.Down);

        return super.previewDeposit(adjustedAssets);
    }

    /// @inheritdoc ERC4626Upgradeable
    function previewMint(uint256 shares) public view virtual override returns (uint256) {
        uint256 assets = super.previewMint(shares);

        // round down the asset amount, to deposit an amont equivalent to a natural number of vTokens, without decimals
        return _roundAssets(assets, Rounding.Down);
    }

    /// @inheritdoc ERC4626Upgradeable
    function previewWithdraw(uint256 assets) public view virtual override returns (uint256) {
        // round up the asset amount to redeem a natural number of vTokens, without decimals
        uint256 adjustedAssets = _roundAssets(assets, Rounding.Up);

        return super.previewWithdraw(adjustedAssets);
    }

    /// @inheritdoc ERC4626Upgradeable
    function previewRedeem(uint256 shares) public view virtual override returns (uint256) {
        uint256 assets = super.previewRedeem(shares);

        // round down the asset amount to redeem a natural number of vTokens, without decimals
        return _roundAssets(assets, Rounding.Down);
    }

    /// @notice Returns the total amount of assets deposited
    /// @return Amount of assets deposited
    function totalAssets() public view virtual override returns (uint256) {
        return (vToken.balanceOf(address(this)) * vToken.exchangeRateStored()) / EXP_SCALE;
    }

    /// @notice Returns the maximum deposit allowed based on Venus supply caps.
    /// @dev If minting is paused or the supply cap is reached, returns 0.
    /// @param /*account*/ The address of the account.
    /// @return The maximum amount of assets that can be deposited.
    function maxDeposit(address /*account*/) public view virtual override returns (uint256) {
        if (comptroller.actionPaused(address(vToken), Action.MINT)) {
            return 0;
        }

        uint256 supplyCap = comptroller.supplyCaps(address(vToken));
        uint256 totalSupply_ = (vToken.totalSupply() * vToken.exchangeRateStored()) / EXP_SCALE;
        return supplyCap > totalSupply_ ? supplyCap - totalSupply_ : 0;
    }

    /// @notice Returns the maximum amount of shares that can be minted.
    /// @dev This is derived from the maximum deposit amount converted to shares.
    /// @param /*account*/ The address of the account.
    /// @return The maximum number of shares that can be minted.
    function maxMint(address /*account*/) public view virtual override returns (uint256) {
        return convertToShares(maxDeposit(address(0)));
    }

    /// @notice Returns the maximum amount that can be withdrawn.
    /// @dev The withdrawable amount is limited by the available cash in the vault.
    /// @param receiver The address of the account withdrawing.
    /// @return The maximum amount of assets that can be withdrawn.
    function maxWithdraw(address receiver) public view virtual override returns (uint256) {
        if (comptroller.actionPaused(address(vToken), Action.REDEEM)) {
            return 0;
        }

        uint256 cash = vToken.getCash();
        uint256 totalReserves = vToken.totalReserves();
        uint256 assetsBalance = convertToAssets(balanceOf(receiver));

        if (cash < totalReserves) {
            return 0;
        } else {
            uint256 availableCash = cash - totalReserves;
            return availableCash < assetsBalance ? availableCash : assetsBalance;
        }
    }

    /// @notice Returns the maximum amount of shares that can be redeemed.
    /// @dev Redemption is limited by the available cash in the vault.
    /// @param receiver The address of the account redeeming.
    /// @return The maximum number of shares that can be redeemed.
    function maxRedeem(address receiver) public view virtual override returns (uint256) {
        if (comptroller.actionPaused(address(vToken), Action.REDEEM)) {
            return 0;
        }

        uint256 cash = vToken.getCash();
        uint256 totalReserves = vToken.totalReserves();
        if (cash < totalReserves) {
            return 0;
        } else {
            uint256 availableCash = cash - totalReserves;
            uint256 availableCashInShares = convertToShares(availableCash);
            uint256 shareBalance = balanceOf(receiver);
            return availableCashInShares < shareBalance ? availableCashInShares : shareBalance;
        }
    }

    /// @notice Redeems underlying assets before withdrawing from the vault.
    /// @dev Calls `redeemUnderlying` on the vToken contract. Reverts on error.
    /// @param assets The amount of underlying assets to redeem.
    /// @return The amount of assets transferred in
    function beforeWithdraw(uint256 assets) internal returns (uint256) {
        IERC20Upgradeable token = IERC20Upgradeable(asset());
        uint256 balanceBefore = token.balanceOf(address(this));

        uint256 errorCode = vToken.redeemUnderlying(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }

        uint256 balanceAfter = token.balanceOf(address(this));
        // Return the amount that was *actually* transferred
        return balanceAfter - balanceBefore;
    }

    /// @notice Mints vTokens after depositing assets.
    /// @dev Calls `mint` on the vToken contract. Reverts on error.
    /// @param assets The amount of underlying assets to deposit.
    function afterDeposit(uint256 assets) internal {
        ERC20Upgradeable(asset()).safeApprove(address(vToken), assets);
        uint256 errorCode = vToken.mint(assets);
        if (errorCode != NO_ERROR) {
            revert VenusERC4626__VenusError(errorCode);
        }
    }

    /// @notice Sets a new reward recipient address
    /// @param newRecipient The address of the new reward recipient
    /// @custom:error ZeroAddressNotAllowed is thrown when the new recipient address is zero
    /// @custom:event RewardRecipientUpdated is emitted when the reward recipient address is updated
    function _setRewardRecipient(address newRecipient) internal {
        ensureNonzeroAddress(newRecipient);

        emit RewardRecipientUpdated(rewardRecipient, newRecipient);
        rewardRecipient = newRecipient;
    }

    /// @notice Override `_decimalsOffset` to normalize decimals to 18 for all VenusERC4626 vaults.
    /// @return Gap between 18 and the decimals of the asset token
    function _decimalsOffset() internal view virtual override returns (uint8) {
        return 18 - ERC20Upgradeable(asset()).decimals();
    }

    /// @notice Generates and returns the derived name of the vault considering the asset name
    /// @param asset_ Asset to be accepted in the vault whose name this function will return
    /// @return Name of the vault considering the asset name
    function _generateVaultName(ERC20Upgradeable asset_) internal view returns (string memory) {
        return string(abi.encodePacked("ERC4626-Wrapped Venus ", asset_.name()));
    }

    /// @notice Generates and returns the derived symbol of the vault considering the asset symbol
    /// @param asset_ Asset to be accepted in the vault whose symbol this function will return
    /// @return Symbol of the vault considering the asset name
    function _generateVaultSymbol(ERC20Upgradeable asset_) internal view returns (string memory) {
        return string(abi.encodePacked("v4626", asset_.symbol()));
    }

    /// @notice Round the amount of assets, up or down, to a multiple of the exchange rate. That way the
    /// associated number of VTokens won't have any decimals
    /// @param assets The amount of assets to round
    /// @param rounding If the round should be up (Rounding.Up), or down (Rounding.Down)
    /// @return The rounded amount of assets
    function _roundAssets(uint256 assets, Rounding rounding) internal view returns (uint256) {
        uint256 exchangeRate = vToken.exchangeRateStored();
        uint256 redeemTokens = (assets * EXP_SCALE) / exchangeRate;

        uint256 _redeemAmount = (redeemTokens * exchangeRate) / EXP_SCALE;

        if (_redeemAmount != 0 && _redeemAmount != assets && rounding == Rounding.Up) redeemTokens++; // round up

        // redeemAmount = exchangeRate * redeemTokens
        return (exchangeRate * redeemTokens) / EXP_SCALE;
    }
}
