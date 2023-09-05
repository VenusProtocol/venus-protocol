// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

contract PrimeLiquidityProvider is Ownable2StepUpgradeable, AccessControlledV8 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The initial TOKEN index
    uint224 public constant INITIAL_INDEX = 1e36;

    /// @notice Address of the Prime contract
    address public prime;

    /// @notice The rate at which token is distributed (per block)
    mapping(address => uint256) public tokenDistributionSpeeds;

    /// @notice The rate at which token is distributed to the Prime contract
    mapping(address => uint256) public lastAccruedBlock;

    /// @notice The token accrued but not yet transferred to prime contract
    mapping(address => uint256) public tokenAmountAccrued;

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    uint256[46] private __gap;

    /// @notice Emitted when a token distribution is initialized
    event TokenDistributionInitialized(address indexed token);

    /// @notice Emitted when a new token distribution speed is set
    event TokenDistributionSpeedUpdated(address indexed token, uint256 newSpeed);

    /// @notice Emitted when distribution state(Index and block) is updated
    event TokensAccrued(address indexed token);

    /// @notice Emitted when token is transferred to the prime contract
    event TokenTransferredToPrime(address indexed token, uint256 amount);

    /// @notice Thrown when arguments are passed are invalid
    error InvalidArguments();

    /**
     * @param prime_ Address of the Prime contract
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address prime_) {
        prime = prime_;

        _disableInitializers();
    }

    /**
     * @notice Accrue token by updating the distribution state
     * @param token Address of the token
     * @custom:event Emits TokensAccrued event
     */
    function accrueTokens(address token) public {
        uint256 distributionSpeed = tokenDistributionSpeeds[token];
        uint256 blockNumber = getBlockNumber();

        uint256 deltaBlocks = blockNumber - lastAccruedBlock[token];

        if (deltaBlocks > 0 && distributionSpeed > 0) {
            uint256 balance = IERC20Upgradeable(token).balanceOf(address(this));
            uint256 accruedSinceUpdate = deltaBlocks * distributionSpeed;
            uint256 tokenAccrued = (balance * accruedSinceUpdate);

            lastAccruedBlock[token] = blockNumber;
            tokenAmountAccrued[token] += tokenAccrued;
        } else if (deltaBlocks > 0) {
            lastAccruedBlock[token] = blockNumber;
        }

        emit TokensAccrued(token);
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
        __Ownable2Step_init();
        __AccessControlled_init_unchained(accessControlManager_);

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
     * @notice Set distribution speed for tokens
     * @param tokens_ Array of addresses of the tokens
     * @param distributionSpeeds_ New distribution speeds for tokens
     * @custom:access Controled by ACM
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
    function releaseFund(address token_) external {
        if (token_ == address(0)) {
            revert InvalidArguments();
        }

        accrueTokens(token_);
        uint256 accruedAmount = tokenAmountAccrued[token_];
        tokenAmountAccrued[token_] = 0;

        IERC20Upgradeable(token_).safeTransfer(prime, accruedAmount);

        emit TokenTransferredToPrime(token_, accruedAmount);
    }

    /**
     * @notice Initialize the distribution of the token
     * @param token_ Address of the token to be intialized
     * @custom:event Emits TokenDistributionInitialized event
     * @custom:error Throw error message for exceeding 32 bits for block number
     */
    function _initializeToken(address token_) internal {
        uint256 blockNumber = getBlockNumber();

        /*
         * Update token state block number
         */
        lastAccruedBlock[token_] = blockNumber;

        emit TokenDistributionInitialized(token_);
    }

    /**
     * @notice Set distribution speed for single token
     * @param token Address of the token
     * @param distributionSpeed New distribution speed for token
     * @custom:event Emits TokenDistributionSpeedUpdated event
     */
    function _setTokenDistributionSpeed(address token, uint256 distributionSpeed) internal {
        if (tokenDistributionSpeeds[token] != distributionSpeed) {
            // Distribution speed updated so let's update distribution state to ensure that
            //  1. Token accrued properly for the old speed, and
            //  2. Token accrued at the new speed starts after this block.
            accrueTokens(token);

            // Update speed and emit event
            tokenDistributionSpeeds[token] = distributionSpeed;
            emit TokenDistributionSpeedUpdated(token, distributionSpeed);
        }
    }

    function getBlockNumber() public view virtual returns (uint256) {
        return block.number;
    }
}
