// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract PrimeLiquidityProvider is AccessControlledV8, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The max token distribution speed
    uint256 public constant MAX_DISTRIBUTION_SPEED = 1e18;

    /// @notice exp scale
    uint256 internal constant EXP_SCALE = 1e18;

    /// @notice Address of the Prime contract
    address public immutable prime;

    /// @notice The rate at which token is distributed (per block)
    mapping(address => uint256) public tokenDistributionSpeeds;

    /// @notice The rate at which token is distributed to the Prime contract
    mapping(address => uint256) public lastAccruedBlock;

    /// @notice The token accrued but not yet transferred to prime contract
    mapping(address => uint256) public tokenAmountAccrued;

    /// @notice Emitted when a token distribution is initialized
    event TokenDistributionInitialized(address indexed token);

    /// @notice Emitted when a new token distribution speed is set
    event TokenDistributionSpeedUpdated(address indexed token, uint256 newSpeed);

    /// @notice Emitted when distribution state(Index and block) is updated
    event TokensAccrued(address indexed token, uint256 amount);

    /// @notice Emitted when token is transferred to the prime contract
    event TokenTransferredToPrime(address indexed token, uint256 amount);

    /// @notice Emitted on sweep token success
    event SweepToken(address indexed token, address indexed to, uint256 sweepAmount);

    /// @notice Emitted on updation of initial balance for token
    event TokenInitialBalanceUpdated(address indexed token, uint256 balance);

    /// @notice Emitted when funds transfer is paused
    event FundsTransferPaused();

    /// @notice Emitted when funds transfer is resumed
    event FundsTransferResumed();

    /// @notice Thrown when arguments are passed are invalid
    error InvalidArguments();

    /// @notice Thrown when distribution speed is greater than MAX_DISTRIBUTION_SPEED
    error InvalidDistributionSpeed(uint256 speed, uint256 maxSpeed);

    /// @notice Thrown when token is initialized
    error TokenAlreadyInitialized(address token);

    ///@notice Error thrown when swapRouter's balance is less than sweep amount
    error InsufficientBalance(uint256 sweepAmount, uint256 balance);

    /// @notice Emitted when funds transfer is paused
    error FundsTransferIsPaused();

    /**
     * @param prime_ Address of the Prime contract
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address prime_) {
        _ensureZeroAddress(prime_);
        prime = prime_;

        _disableInitializers();
    }

    /**
     * @notice RewardsDistributor initializer
     * @dev Initializes the deployer to owner
     * @param accessControlManager_ AccessControlManager contract address
     * @param tokens_ Array of addresses of the tokens
     * @param distributionSpeeds_ New distribution speeds for tokens
     * @custom:error Throw InvalidArguments on different length of tokens and speeds array
     */
    function initialize(
        address accessControlManager_,
        address[] calldata tokens_,
        uint256[] calldata distributionSpeeds_
    ) external initializer {
        __AccessControlled_init(accessControlManager_);
        __Pausable_init();

        uint256 numTokens = tokens_.length;
        if (numTokens != distributionSpeeds_.length) {
            revert InvalidArguments();
        }

        for (uint256 i; i < numTokens; ) {
            _initializeToken(tokens_[i]);
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
        for (uint256 i; i < tokens_.length; ) {
            _initializeToken(tokens_[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Pause fund transfer of tokens to Prime contract
     * @custom:event Emits FundsTransferPaused on success
     * @custom:access Controlled by ACM
     */
    function pauseFundsTransfer() external {
        _checkAccessAllowed("pauseFundsTransfer()");
        _pause();
    }

    /**
     * @notice Resume fund transfer of tokens to Prime contract
     * @custom:event Emits FundsTransferResumed on success
     * @custom:access Controlled by ACM
     */
    function resumeFundsTransfer() external {
        _checkAccessAllowed("resumeFundsTransfer()");
        _unpause();
    }

    /**
     * @notice Set distribution speed (amount of token distribute per block)
     * @param tokens_ Array of addresses of the tokens
     * @param distributionSpeeds_ New distribution speeds for tokens
     * @custom:access Controlled by ACM
     * @custom:error Throw InvalidArguments on different length of tokens and speeds array
     */
    function setTokensDistributionSpeed(address[] calldata tokens_, uint256[] calldata distributionSpeeds_) external {
        _checkAccessAllowed("setTokensDistributionSpeed(address[],uint256[])");
        uint256 numTokens = tokens_.length;

        if (numTokens != distributionSpeeds_.length) {
            revert InvalidArguments();
        }

        for (uint256 i; i < numTokens; ) {
            _setTokenDistributionSpeed(tokens_[i], distributionSpeeds_[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Claim all the token accrued till last block
     * @param token_ The list of tokens to claim tokens
     * @custom:event Emits TokenTransferredToPrime event
     * @custom:error Throw InvalidArguments on Zero address(token)
     */
    function releaseFunds(address token_) external {
        if (paused()) {
            revert FundsTransferIsPaused();
        }

        accrueTokens(token_);
        uint256 accruedAmount = tokenAmountAccrued[token_];
        tokenAmountAccrued[token_] = 0;

        IERC20Upgradeable(token_).safeTransfer(prime, accruedAmount);

        emit TokenTransferredToPrime(token_, accruedAmount);
    }

    /**
     * @notice A public function to sweep accidental ERC-20 transfers to this contract. Tokens are sent to user
     * @param token_ The address of the ERC-20 token to sweep
     * @param to_ The address of the recipient
     * @param amount_ The amount of tokens needs to transfer
     * @custom:event Emits SweepToken event
     * @custom:error Throw InsufficientBalance on Zero address(token)
     * @custom:access Only Governance
     */
    function sweepToken(IERC20Upgradeable token_, address to_, uint256 amount_) external onlyOwner {
        uint256 balance = token_.balanceOf(address(this));
        if (amount_ > balance) {
            revert InsufficientBalance(amount_, balance);
        }

        token_.safeTransfer(to_, balance);

        emit SweepToken(address(token_), to_, amount_);
    }

    /**
     * @notice Accrue token by updating the distribution state
     * @param token_ Address of the token
     * @custom:event Emits TokensAccrued event
     */
    function accrueTokens(address token_) public {
        _ensureZeroAddress(token_);

        uint256 blockNumber = getBlockNumber();
        uint256 deltaBlocks = blockNumber - lastAccruedBlock[token_];

        if (deltaBlocks > 0) {
            uint256 distributionSpeed = tokenDistributionSpeeds[token_];
            uint256 balance = IERC20Upgradeable(token_).balanceOf(address(this));

            if (distributionSpeed > 0 && (balance - tokenAmountAccrued[token_]) > 0) {
                uint256 accruedSinceUpdate = deltaBlocks * distributionSpeed;
                uint256 tokenAccrued = (balance <= accruedSinceUpdate ? balance : accruedSinceUpdate);

                tokenAmountAccrued[token_] += tokenAccrued;
                emit TokensAccrued(token_, tokenAccrued);
            }

            lastAccruedBlock[token_] = blockNumber;
        }
    }

    /// @notice Get the latest block number
    function getBlockNumber() public view virtual returns (uint256) {
        return block.number;
    }

    /**
     * @notice Initialize the distribution of the token
     * @param token_ Address of the token to be intialized
     * @custom:event Emits TokenDistributionInitialized event
     * @custom:error Throw TokenAlreadyInitialized if token is already initialized
     */
    function _initializeToken(address token_) internal {
        _ensureZeroAddress(token_);
        uint256 blockNumber = getBlockNumber();
        uint256 intializedBlock = lastAccruedBlock[token_];

        if (intializedBlock > 0) {
            revert TokenAlreadyInitialized(token_);
        }

        /*
         * Update token state block number
         */
        lastAccruedBlock[token_] = blockNumber;

        emit TokenDistributionInitialized(token_);
    }

    /**
     * @notice Set distribution speed (amount of token distribute per block)
     * @param token_ Address of the token
     * @param distributionSpeed_ New distribution speed for token
     * @custom:event Emits TokenDistributionSpeedUpdated event
     * @custom:error Throw InvalidDistributionSpeed if speed is greater than max speed
     */
    function _setTokenDistributionSpeed(address token_, uint256 distributionSpeed_) internal {
        if (distributionSpeed_ > MAX_DISTRIBUTION_SPEED) {
            revert InvalidDistributionSpeed(distributionSpeed_, MAX_DISTRIBUTION_SPEED);
        }

        if (tokenDistributionSpeeds[token_] != distributionSpeed_) {
            // Distribution speed updated so let's update distribution state to ensure that
            //  1. Token accrued properly for the old speed, and
            //  2. Token accrued at the new speed starts after this block.
            accrueTokens(token_);

            // Update speed
            tokenDistributionSpeeds[token_] = distributionSpeed_;

            emit TokenDistributionSpeedUpdated(token_, distributionSpeed_);
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
