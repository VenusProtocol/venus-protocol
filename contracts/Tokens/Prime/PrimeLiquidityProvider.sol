// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { PrimeLiquidityProviderStorageV1 } from "./PrimeLiquidityProviderStorage.sol";
import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { IPrimeLiquidityProvider } from "./Interfaces/IPrimeLiquidityProvider.sol";
import { MaxLoopsLimitHelper } from "@venusprotocol/solidity-utilities/contracts/MaxLoopsLimitHelper.sol";
import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";

/**
 * @title PrimeLiquidityProvider
 * @author Venus
 * @notice PrimeLiquidityProvider is used to fund Prime
 */
contract PrimeLiquidityProvider is
    IPrimeLiquidityProvider,
    AccessControlledV8,
    PausableUpgradeable,
    MaxLoopsLimitHelper,
    PrimeLiquidityProviderStorageV1,
    TimeManagerV8
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The default max token distribution speed
    uint256 public constant DEFAULT_MAX_DISTRIBUTION_SPEED = 1e18;

    /// @notice Emitted when a token distribution is initialized
    event TokenDistributionInitialized(address indexed token);

    /// @notice Emitted when a new token distribution speed is set
    event TokenDistributionSpeedUpdated(address indexed token, uint256 oldSpeed, uint256 newSpeed);

    /// @notice Emitted when a new max distribution speed for token is set
    event MaxTokenDistributionSpeedUpdated(address indexed token, uint256 oldSpeed, uint256 newSpeed);

    /// @notice Emitted when prime token contract address is changed
    event PrimeTokenUpdated(address indexed oldPrimeToken, address indexed newPrimeToken);

    /// @notice Emitted when distribution state(Index and block or second) is updated
    event TokensAccrued(address indexed token, uint256 amount);

    /// @notice Emitted when token is transferred to the prime contract
    event TokenTransferredToPrime(address indexed token, uint256 amount);

    /// @notice Emitted on sweep token success
    event SweepToken(address indexed token, address indexed to, uint256 sweepAmount);

    /// @notice Thrown when arguments are passed are invalid
    error InvalidArguments();

    /// @notice Thrown when distribution speed is greater than maxTokenDistributionSpeeds[tokenAddress]
    error InvalidDistributionSpeed(uint256 speed, uint256 maxSpeed);

    /// @notice Thrown when caller is not the desired caller
    error InvalidCaller();

    /// @notice Thrown when token is initialized
    error TokenAlreadyInitialized(address token);

    ///@notice Error thrown when PrimeLiquidityProvider's balance is less than sweep amount
    error InsufficientBalance(uint256 sweepAmount, uint256 balance);

    /// @notice Error thrown when funds transfer is paused
    error FundsTransferIsPaused();

    /// @notice Error thrown when accrueTokens is called for an uninitialized token
    error TokenNotInitialized(address token_);

    /// @notice Error thrown when argument value in setter is same as previous value
    error AddressesMustDiffer();

    /**
     * @notice Compares two addresses to ensure they are different
     * @param oldAddress The original address to compare
     * @param newAddress The new address to compare
     */
    modifier compareAddress(address oldAddress, address newAddress) {
        if (newAddress == oldAddress) {
            revert AddressesMustDiffer();
        }
        _;
    }

    /**
     * @notice Prime Liquidity Provider constructor
     * @param _timeBased A boolean indicating whether the contract is based on time or block.
     * @param _blocksPerYear total blocks per year
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(bool _timeBased, uint256 _blocksPerYear) TimeManagerV8(_timeBased, _blocksPerYear) {
        _disableInitializers();
    }

    /**
     * @notice PrimeLiquidityProvider initializer
     * @dev Initializes the deployer to owner
     * @param accessControlManager_ AccessControlManager contract address
     * @param tokens_ Array of addresses of the tokens
     * @param distributionSpeeds_ New distribution speeds for tokens
     * @param loopsLimit_ Maximum number of loops allowed in a single transaction
     * @custom:error Throw InvalidArguments on different length of tokens and speeds array
     */
    function initialize(
        address accessControlManager_,
        address[] calldata tokens_,
        uint256[] calldata distributionSpeeds_,
        uint256[] calldata maxDistributionSpeeds_,
        uint256 loopsLimit_
    ) external initializer {
        _ensureZeroAddress(accessControlManager_);

        __AccessControlled_init(accessControlManager_);
        __Pausable_init();
        _setMaxLoopsLimit(loopsLimit_);

        uint256 numTokens = tokens_.length;
        _ensureMaxLoops(numTokens);

        if ((numTokens != distributionSpeeds_.length) || (numTokens != maxDistributionSpeeds_.length)) {
            revert InvalidArguments();
        }

        for (uint256 i; i < numTokens; ) {
            _initializeToken(tokens_[i]);
            _setMaxTokenDistributionSpeed(tokens_[i], maxDistributionSpeeds_[i]);
            _setTokenDistributionSpeed(tokens_[i], distributionSpeeds_[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Initialize the distribution of the token
     * @param tokens_ Array of addresses of the tokens to be intialized
     * @custom:access Only Governance
     */
    function initializeTokens(address[] calldata tokens_) external onlyOwner {
        uint256 tokensLength = tokens_.length;
        _ensureMaxLoops(tokensLength);

        for (uint256 i; i < tokensLength; ) {
            _initializeToken(tokens_[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Pause fund transfer of tokens to Prime contract
     * @custom:access Controlled by ACM
     */
    function pauseFundsTransfer() external {
        _checkAccessAllowed("pauseFundsTransfer()");
        _pause();
    }

    /**
     * @notice Resume fund transfer of tokens to Prime contract
     * @custom:access Controlled by ACM
     */
    function resumeFundsTransfer() external {
        _checkAccessAllowed("resumeFundsTransfer()");
        _unpause();
    }

    /**
     * @notice Set distribution speed (amount of token distribute per block or second)
     * @param tokens_ Array of addresses of the tokens
     * @param distributionSpeeds_ New distribution speeds for tokens
     * @custom:access Controlled by ACM
     * @custom:error Throw InvalidArguments on different length of tokens and speeds array
     */
    function setTokensDistributionSpeed(address[] calldata tokens_, uint256[] calldata distributionSpeeds_) external {
        _checkAccessAllowed("setTokensDistributionSpeed(address[],uint256[])");
        uint256 numTokens = tokens_.length;
        _ensureMaxLoops(numTokens);

        if (numTokens != distributionSpeeds_.length) {
            revert InvalidArguments();
        }

        for (uint256 i; i < numTokens; ) {
            _ensureTokenInitialized(tokens_[i]);
            _setTokenDistributionSpeed(tokens_[i], distributionSpeeds_[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Set max distribution speed for token (amount of maximum token distribute per block or second)
     * @param tokens_ Array of addresses of the tokens
     * @param maxDistributionSpeeds_ New distribution speeds for tokens
     * @custom:access Controlled by ACM
     * @custom:error Throw InvalidArguments on different length of tokens and speeds array
     */
    function setMaxTokensDistributionSpeed(
        address[] calldata tokens_,
        uint256[] calldata maxDistributionSpeeds_
    ) external {
        _checkAccessAllowed("setMaxTokensDistributionSpeed(address[],uint256[])");
        uint256 numTokens = tokens_.length;
        _ensureMaxLoops(numTokens);

        if (numTokens != maxDistributionSpeeds_.length) {
            revert InvalidArguments();
        }

        for (uint256 i; i < numTokens; ) {
            _setMaxTokenDistributionSpeed(tokens_[i], maxDistributionSpeeds_[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Set the prime token contract address
     * @param prime_ The new address of the prime token contract
     * @custom:event Emits PrimeTokenUpdated event
     * @custom:access Only owner
     */
    function setPrimeToken(address prime_) external onlyOwner compareAddress(prime, prime_) {
        _ensureZeroAddress(prime_);

        emit PrimeTokenUpdated(prime, prime_);
        prime = prime_;
    }

    /**
     * @notice Set the limit for the loops can iterate to avoid the DOS
     * @param loopsLimit Limit for the max loops can execute at a time
     * @custom:event Emits MaxLoopsLimitUpdated event on success
     * @custom:access Controlled by ACM
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external {
        _checkAccessAllowed("setMaxLoopsLimit(uint256)");
        _setMaxLoopsLimit(loopsLimit);
    }

    /**
     * @notice Claim all the token accrued till last block or second
     * @param token_ The token to release to the Prime contract
     * @custom:event Emits TokenTransferredToPrime event
     * @custom:error Throw InvalidArguments on Zero address(token)
     * @custom:error Throw FundsTransferIsPaused is paused
     * @custom:error Throw InvalidCaller if the sender is not the Prime contract
     */
    function releaseFunds(address token_) external {
        address _prime = prime;
        if (msg.sender != _prime) revert InvalidCaller();
        if (paused()) {
            revert FundsTransferIsPaused();
        }

        accrueTokens(token_);
        uint256 accruedAmount = _tokenAmountAccrued[token_];
        delete _tokenAmountAccrued[token_];

        emit TokenTransferredToPrime(token_, accruedAmount);

        IERC20Upgradeable(token_).safeTransfer(_prime, accruedAmount);
    }

    /**
     * @notice A public function to sweep accidental ERC-20 transfers to this contract. Tokens are sent to user
     * @param token_ The address of the ERC-20 token to sweep
     * @param to_ The address of the recipient
     * @param amount_ The amount of tokens needs to transfer
     * @custom:event Emits SweepToken event
     * @custom:error Throw InsufficientBalance if amount_ is greater than the available balance of the token in the contract
     * @custom:access Only Governance
     */
    function sweepToken(IERC20Upgradeable token_, address to_, uint256 amount_) external onlyOwner {
        uint256 balance = token_.balanceOf(address(this));
        if (amount_ > balance) {
            revert InsufficientBalance(amount_, balance);
        }

        emit SweepToken(address(token_), to_, amount_);

        token_.safeTransfer(to_, amount_);
    }

    /**
     * @notice Get rewards per block or second for token
     * @param token_ Address of the token
     * @return speed returns the per block or second reward
     */
    function getEffectiveDistributionSpeed(address token_) external view returns (uint256) {
        uint256 distributionSpeed = tokenDistributionSpeeds[token_];
        uint256 balance = IERC20Upgradeable(token_).balanceOf(address(this));
        uint256 accrued = _tokenAmountAccrued[token_];

        if (balance > accrued) {
            return distributionSpeed;
        }

        return 0;
    }

    /**
     * @notice Accrue token by updating the distribution state
     * @param token_ Address of the token
     * @custom:event Emits TokensAccrued event
     */
    function accrueTokens(address token_) public {
        _ensureZeroAddress(token_);

        _ensureTokenInitialized(token_);

        uint256 blockNumberOrSecond = getBlockNumberOrTimestamp();
        uint256 deltaBlocksOrSeconds;
        unchecked {
            deltaBlocksOrSeconds = blockNumberOrSecond - lastAccruedBlockOrSecond[token_];
        }

        if (deltaBlocksOrSeconds != 0) {
            uint256 distributionSpeed = tokenDistributionSpeeds[token_];
            uint256 balance = IERC20Upgradeable(token_).balanceOf(address(this));

            uint256 balanceDiff = balance - _tokenAmountAccrued[token_];
            if (distributionSpeed != 0 && balanceDiff != 0) {
                uint256 accruedSinceUpdate = deltaBlocksOrSeconds * distributionSpeed;
                uint256 tokenAccrued = (balanceDiff <= accruedSinceUpdate ? balanceDiff : accruedSinceUpdate);

                _tokenAmountAccrued[token_] += tokenAccrued;
                emit TokensAccrued(token_, tokenAccrued);
            }

            lastAccruedBlockOrSecond[token_] = blockNumberOrSecond;
        }
    }

    /**
     * @notice Get the last accrued block or second for token
     * @param token_ Address of the token
     * @return blockNumberOrSecond returns the last accrued block or second
     */
    function lastAccruedBlock(address token_) external view returns (uint256) {
        return lastAccruedBlockOrSecond[token_];
    }

    /**
     * @notice Get the tokens accrued
     * @param token_ Address of the token
     * @return returns the amount of accrued tokens for the token provided
     */
    function tokenAmountAccrued(address token_) external view returns (uint256) {
        return _tokenAmountAccrued[token_];
    }

    /**
     * @notice Initialize the distribution of the token
     * @param token_ Address of the token to be intialized
     * @custom:event Emits TokenDistributionInitialized event
     * @custom:error Throw TokenAlreadyInitialized if token is already initialized
     */
    function _initializeToken(address token_) internal {
        _ensureZeroAddress(token_);
        uint256 blockNumberOrSecond = getBlockNumberOrTimestamp();
        uint256 initializedBlockOrSecond = lastAccruedBlockOrSecond[token_];

        if (initializedBlockOrSecond != 0) {
            revert TokenAlreadyInitialized(token_);
        }

        /*
         * Update token state block number or second
         */
        lastAccruedBlockOrSecond[token_] = blockNumberOrSecond;

        emit TokenDistributionInitialized(token_);
    }

    /**
     * @notice Set distribution speed (amount of token distribute per block or second)
     * @param token_ Address of the token
     * @param distributionSpeed_ New distribution speed for token
     * @custom:event Emits TokenDistributionSpeedUpdated event
     * @custom:error Throw InvalidDistributionSpeed if speed is greater than max speed
     */
    function _setTokenDistributionSpeed(address token_, uint256 distributionSpeed_) internal {
        uint256 maxDistributionSpeed = maxTokenDistributionSpeeds[token_];
        if (maxDistributionSpeed == 0) {
            maxTokenDistributionSpeeds[token_] = maxDistributionSpeed = DEFAULT_MAX_DISTRIBUTION_SPEED;
        }

        if (distributionSpeed_ > maxDistributionSpeed) {
            revert InvalidDistributionSpeed(distributionSpeed_, maxDistributionSpeed);
        }

        uint256 oldDistributionSpeed = tokenDistributionSpeeds[token_];
        if (oldDistributionSpeed != distributionSpeed_) {
            // Distribution speed updated so let's update distribution state to ensure that
            //  1. Token accrued properly for the old speed, and
            //  2. Token accrued at the new speed starts after this block or second.
            accrueTokens(token_);

            // Update speed
            tokenDistributionSpeeds[token_] = distributionSpeed_;

            emit TokenDistributionSpeedUpdated(token_, oldDistributionSpeed, distributionSpeed_);
        }
    }

    /**
     * @notice Set max distribution speed (amount of maximum token distribute per block or second)
     * @param token_ Address of the token
     * @param maxDistributionSpeed_ New max distribution speed for token
     * @custom:event Emits MaxTokenDistributionSpeedUpdated event
     */
    function _setMaxTokenDistributionSpeed(address token_, uint256 maxDistributionSpeed_) internal {
        emit MaxTokenDistributionSpeedUpdated(token_, tokenDistributionSpeeds[token_], maxDistributionSpeed_);
        maxTokenDistributionSpeeds[token_] = maxDistributionSpeed_;
    }

    /**
     * @notice Revert on non initialized token
     * @param token_ Token Address to be verified for
     */
    function _ensureTokenInitialized(address token_) internal view {
        uint256 lastBlockOrSecondAccrued = lastAccruedBlockOrSecond[token_];

        if (lastBlockOrSecondAccrued == 0) {
            revert TokenNotInitialized(token_);
        }
    }

    /**
     * @notice Revert on zero address
     * @param address_ Address to be verified
     */
    function _ensureZeroAddress(address address_) internal pure {
        if (address_ == address(0)) {
            revert InvalidArguments();
        }
    }
}
