// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.5.16;

import { PriceOracle } from "../../Oracle/PriceOracle.sol";
import { VAIControllerErrorReporter } from "../../Utils/ErrorReporter.sol";
import { Exponential } from "../../Utils/Exponential.sol";
import { ComptrollerInterface } from "../../Comptroller/ComptrollerInterface.sol";
import { IAccessControlManagerV5 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV5.sol";
import { VToken, EIP20Interface } from "../VTokens/VToken.sol";
import { VAIUnitroller, VAIControllerStorageG4 } from "./VAIUnitroller.sol";
import { VAIControllerInterface } from "./VAIControllerInterface.sol";
import { VAI } from "./VAI.sol";
import { IPrime } from "../Prime/IPrime.sol";
import { VTokenInterface } from "../VTokens/VTokenInterfaces.sol";

/**
 * @title VAI Comptroller
 * @author Venus
 * @notice This is the implementation contract for the VAIUnitroller proxy
 */
contract VAIController is VAIControllerInterface, VAIControllerStorageG4, VAIControllerErrorReporter, Exponential {
    /// @notice Initial index used in interest computations
    uint256 public constant INITIAL_VAI_MINT_INDEX = 1e18;

    /// @notice Emitted when Comptroller is changed
    event NewComptroller(ComptrollerInterface oldComptroller, ComptrollerInterface newComptroller);

    /// @notice Emitted when mint for prime holder is changed
    event MintOnlyForPrimeHolder(bool previousMintEnabledOnlyForPrimeHolder, bool newMintEnabledOnlyForPrimeHolder);

    /// @notice Emitted when Prime is changed
    event NewPrime(address oldPrime, address newPrime);

    /// @notice Event emitted when VAI is minted
    event MintVAI(address minter, uint256 mintVAIAmount);

    /// @notice Event emitted when VAI is repaid
    event RepayVAI(address payer, address borrower, uint256 repayVAIAmount);

    /// @notice Event emitted when a borrow is liquidated
    event LiquidateVAI(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        address vTokenCollateral,
        uint256 seizeTokens
    );

    /// @notice Emitted when treasury guardian is changed
    event NewTreasuryGuardian(address oldTreasuryGuardian, address newTreasuryGuardian);

    /// @notice Emitted when treasury address is changed
    event NewTreasuryAddress(address oldTreasuryAddress, address newTreasuryAddress);

    /// @notice Emitted when treasury percent is changed
    event NewTreasuryPercent(uint256 oldTreasuryPercent, uint256 newTreasuryPercent);

    /// @notice Event emitted when VAIs are minted and fee are transferred
    event MintFee(address minter, uint256 feeAmount);

    /// @notice Emiitted when VAI base rate is changed
    event NewVAIBaseRate(uint256 oldBaseRateMantissa, uint256 newBaseRateMantissa);

    /// @notice Emiitted when VAI float rate is changed
    event NewVAIFloatRate(uint256 oldFloatRateMantissa, uint256 newFlatRateMantissa);

    /// @notice Emiitted when VAI receiver address is changed
    event NewVAIReceiver(address oldReceiver, address newReceiver);

    /// @notice Emiitted when VAI mint cap is changed
    event NewVAIMintCap(uint256 oldMintCap, uint256 newMintCap);

    /// @notice Emitted when access control address is changed by admin
    event NewAccessControl(address oldAccessControlAddress, address newAccessControlAddress);

    /// @notice Emitted when VAI token address is changed by admin
    event NewVaiToken(address oldVaiToken, address newVaiToken);

    function initialize() external onlyAdmin {
        require(vaiMintIndex == 0, "already initialized");

        vaiMintIndex = INITIAL_VAI_MINT_INDEX;
        accrualBlockNumber = getBlockNumber();
        mintCap = uint256(-1);

        // The counter starts true to prevent changing it from zero to non-zero (i.e. smaller cost/refund)
        _notEntered = true;
    }

    function _become(VAIUnitroller unitroller) external {
        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        require(unitroller._acceptImplementation() == 0, "change not authorized");
    }

    /**
     * @notice The mintVAI function mints and transfers VAI from the protocol to the user, and adds a borrow balance.
     * The amount minted must be less than the user's Account Liquidity and the mint vai limit.
     * @dev If the Comptroller address is not set, minting is a no-op and the function returns the success code.
     * @param mintVAIAmount The amount of the VAI to be minted.
     * @return 0 on success, otherwise an error code
     */
    // solhint-disable-next-line code-complexity
    function mintVAI(uint256 mintVAIAmount) external nonReentrant returns (uint256) {
        if (address(comptroller) == address(0)) {
            return uint256(Error.NO_ERROR);
        }

        _ensureNonzeroAmount(mintVAIAmount);
        _ensureNotPaused();
        accrueVAIInterest();

        uint256 err;
        address minter = msg.sender;
        address _vai = vai;
        uint256 vaiTotalSupply = EIP20Interface(_vai).totalSupply();

        uint256 vaiNewTotalSupply = add_(vaiTotalSupply, mintVAIAmount);
        require(vaiNewTotalSupply <= mintCap, "mint cap reached");

        uint256 accountMintableVAI;
        (err, accountMintableVAI) = getMintableVAI(minter);
        require(err == uint256(Error.NO_ERROR), "could not compute mintable amount");

        // check that user have sufficient mintableVAI balance
        require(mintVAIAmount <= accountMintableVAI, "minting more than allowed");

        // Calculate the minted balance based on interest index
        uint256 totalMintedVAI = comptroller.mintedVAIs(minter);

        if (totalMintedVAI > 0) {
            uint256 repayAmount = getVAIRepayAmount(minter);
            uint256 remainedAmount = sub_(repayAmount, totalMintedVAI);
            pastVAIInterest[minter] = add_(pastVAIInterest[minter], remainedAmount);
            totalMintedVAI = repayAmount;
        }

        uint256 accountMintVAINew = add_(totalMintedVAI, mintVAIAmount);
        err = comptroller.setMintedVAIOf(minter, accountMintVAINew);
        require(err == uint256(Error.NO_ERROR), "comptroller rejection");

        uint256 remainedAmount;
        if (treasuryPercent != 0) {
            uint256 feeAmount = div_(mul_(mintVAIAmount, treasuryPercent), 1e18);
            remainedAmount = sub_(mintVAIAmount, feeAmount);
            VAI(_vai).mint(treasuryAddress, feeAmount);

            emit MintFee(minter, feeAmount);
        } else {
            remainedAmount = mintVAIAmount;
        }

        VAI(_vai).mint(minter, remainedAmount);
        vaiMinterInterestIndex[minter] = vaiMintIndex;

        emit MintVAI(minter, remainedAmount);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice The repay function transfers VAI interest into the protocol and burns the rest,
     * reducing the borrower's borrow balance. Before repaying VAI, users must first approve
     * VAIController to access their VAI balance.
     * @dev If the Comptroller address is not set, repayment is a no-op and the function returns the success code.
     * @param amount The amount of VAI to be repaid.
     * @return Error code (0=success, otherwise a failure, see ErrorReporter.sol)
     * @return Actual repayment amount
     */
    function repayVAI(uint256 amount) external nonReentrant returns (uint256, uint256) {
        return _repayVAI(msg.sender, amount);
    }

    /**
     * @notice The repay on behalf function transfers VAI interest into the protocol and burns the rest,
     * reducing the borrower's borrow balance. Borrowed VAIs are repaid by another user (possibly the borrower).
     * Before repaying VAI, the payer must first approve VAIController to access their VAI balance.
     * @dev If the Comptroller address is not set, repayment is a no-op and the function returns the success code.
     * @param borrower The account to repay the debt for.
     * @param amount The amount of VAI to be repaid.
     * @return Error code (0=success, otherwise a failure, see ErrorReporter.sol)
     * @return Actual repayment amount
     */
    function repayVAIBehalf(address borrower, uint256 amount) external nonReentrant returns (uint256, uint256) {
        _ensureNonzeroAddress(borrower);
        return _repayVAI(borrower, amount);
    }

    /**
     * @dev Checks the parameters and the protocol state, accrues interest, and invokes repayVAIFresh.
     * @dev If the Comptroller address is not set, repayment is a no-op and the function returns the success code.
     * @param borrower The account to repay the debt for.
     * @param amount The amount of VAI to be repaid.
     * @return Error code (0=success, otherwise a failure, see ErrorReporter.sol)
     * @return Actual repayment amount
     */
    function _repayVAI(address borrower, uint256 amount) internal returns (uint256, uint256) {
        if (address(comptroller) == address(0)) {
            return (0, 0);
        }
        _ensureNonzeroAmount(amount);
        _ensureNotPaused();

        accrueVAIInterest();
        return repayVAIFresh(msg.sender, borrower, amount);
    }

    /**
     * @dev Repay VAI, expecting interest to be accrued
     * @dev Borrowed VAIs are repaid by another user (possibly the borrower).
     * @param payer the account paying off the VAI
     * @param borrower the account with the debt being payed off
     * @param repayAmount the amount of VAI being repaid
     * @return Error code (0=success, otherwise a failure, see ErrorReporter.sol)
     * @return Actual repayment amount
     */
    function repayVAIFresh(address payer, address borrower, uint256 repayAmount) internal returns (uint256, uint256) {
        (uint256 burn, uint256 partOfCurrentInterest, uint256 partOfPastInterest) = getVAICalculateRepayAmount(
            borrower,
            repayAmount
        );

        VAI _vai = VAI(vai);
        _vai.burn(payer, burn);
        bool success = _vai.transferFrom(payer, receiver, partOfCurrentInterest);
        require(success == true, "failed to transfer VAI fee");

        uint256 vaiBalanceBorrower = comptroller.mintedVAIs(borrower);

        uint256 accountVAINew = sub_(sub_(vaiBalanceBorrower, burn), partOfPastInterest);
        pastVAIInterest[borrower] = sub_(pastVAIInterest[borrower], partOfPastInterest);

        uint256 error = comptroller.setMintedVAIOf(borrower, accountVAINew);
        // We have to revert upon error since side-effects already happened at this point
        require(error == uint256(Error.NO_ERROR), "comptroller rejection");

        uint256 repaidAmount = add_(burn, partOfCurrentInterest);
        emit RepayVAI(payer, borrower, repaidAmount);

        return (uint256(Error.NO_ERROR), repaidAmount);
    }

    /**
     * @notice The sender liquidates the vai minters collateral. The collateral seized is transferred to the liquidator.
     * @param borrower The borrower of vai to be liquidated
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @return Error code (0=success, otherwise a failure, see ErrorReporter.sol)
     * @return Actual repayment amount
     */
    function liquidateVAI(
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral
    ) external nonReentrant returns (uint256, uint256) {
        _ensureNotPaused();

        uint256 error = vTokenCollateral.accrueInterest();
        if (error != uint256(Error.NO_ERROR)) {
            // accrueInterest emits logs on errors, but we still want to log the fact that an attempted liquidation failed
            return (fail(Error(error), FailureInfo.VAI_LIQUIDATE_ACCRUE_COLLATERAL_INTEREST_FAILED), 0);
        }

        // liquidateVAIFresh emits borrow-specific logs on errors, so we don't need to
        return liquidateVAIFresh(msg.sender, borrower, repayAmount, vTokenCollateral);
    }

    /**
     * @notice The liquidator liquidates the borrowers collateral by repay borrowers VAI.
     *  The collateral seized is transferred to the liquidator.
     * @dev If the Comptroller address is not set, liquidation is a no-op and the function returns the success code.
     * @param liquidator The address repaying the VAI and seizing collateral
     * @param borrower The borrower of this VAI to be liquidated
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the VAI to repay
     * @return Error code (0=success, otherwise a failure, see ErrorReporter.sol)
     * @return Actual repayment amount
     */
    function liquidateVAIFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral
    ) internal returns (uint256, uint256) {
        if (address(comptroller) != address(0)) {
            accrueVAIInterest();

            /* Fail if liquidate not allowed */
            uint256 allowed = comptroller.liquidateBorrowAllowed(
                address(this),
                address(vTokenCollateral),
                liquidator,
                borrower,
                repayAmount
            );
            if (allowed != 0) {
                return (failOpaque(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_COMPTROLLER_REJECTION, allowed), 0);
            }

            /* Verify vTokenCollateral market's block number equals current block number */
            //if (vTokenCollateral.accrualBlockNumber() != accrualBlockNumber) {
            if (vTokenCollateral.accrualBlockNumber() != getBlockNumber()) {
                return (fail(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_COLLATERAL_FRESHNESS_CHECK), 0);
            }

            /* Fail if borrower = liquidator */
            if (borrower == liquidator) {
                return (fail(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_LIQUIDATOR_IS_BORROWER), 0);
            }

            /* Fail if repayAmount = 0 */
            if (repayAmount == 0) {
                return (fail(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO), 0);
            }

            /* Fail if repayAmount = -1 */
            if (repayAmount == uint256(-1)) {
                return (fail(Error.REJECTION, FailureInfo.VAI_LIQUIDATE_CLOSE_AMOUNT_IS_UINT_MAX), 0);
            }

            /* Fail if repayVAI fails */
            (uint256 repayBorrowError, uint256 actualRepayAmount) = repayVAIFresh(liquidator, borrower, repayAmount);
            if (repayBorrowError != uint256(Error.NO_ERROR)) {
                return (fail(Error(repayBorrowError), FailureInfo.VAI_LIQUIDATE_REPAY_BORROW_FRESH_FAILED), 0);
            }

            /////////////////////////
            // EFFECTS & INTERACTIONS
            // (No safe failures beyond this point)

            /* We calculate the number of collateral tokens that will be seized */
            (uint256 amountSeizeError, uint256 seizeTokens) = comptroller.liquidateVAICalculateSeizeTokens(
                address(vTokenCollateral),
                actualRepayAmount
            );
            require(
                amountSeizeError == uint256(Error.NO_ERROR),
                "VAI_LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED"
            );

            /* Revert if borrower collateral token balance < seizeTokens */
            require(vTokenCollateral.balanceOf(borrower) >= seizeTokens, "VAI_LIQUIDATE_SEIZE_TOO_MUCH");

            uint256 seizeError;
            seizeError = vTokenCollateral.seize(liquidator, borrower, seizeTokens);

            /* Revert if seize tokens fails (since we cannot be sure of side effects) */
            require(seizeError == uint256(Error.NO_ERROR), "token seizure failed");

            /* We emit a LiquidateBorrow event */
            emit LiquidateVAI(liquidator, borrower, actualRepayAmount, address(vTokenCollateral), seizeTokens);

            /* We call the defense hook */
            comptroller.liquidateBorrowVerify(
                address(this),
                address(vTokenCollateral),
                liquidator,
                borrower,
                actualRepayAmount,
                seizeTokens
            );

            return (uint256(Error.NO_ERROR), actualRepayAmount);
        }
    }

    /*** Admin Functions ***/

    /**
     * @notice Sets a new comptroller
     * @dev Admin function to set a new comptroller
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setComptroller(ComptrollerInterface comptroller_) external returns (uint256) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }

        ComptrollerInterface oldComptroller = comptroller;
        comptroller = comptroller_;
        emit NewComptroller(oldComptroller, comptroller_);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Set the prime token contract address
     * @param prime_ The new address of the prime token contract
     */
    function setPrimeToken(address prime_) external onlyAdmin {
        emit NewPrime(prime, prime_);
        prime = prime_;
    }

    /**
     * @notice Set the VAI token contract address
     * @param vai_ The new address of the VAI token contract
     */
    function setVAIToken(address vai_) external onlyAdmin {
        emit NewVaiToken(vai, vai_);
        vai = vai_;
    }

    /**
     * @notice Toggle mint only for prime holder
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function toggleOnlyPrimeHolderMint() external returns (uint256) {
        _ensureAllowed("toggleOnlyPrimeHolderMint()");

        if (!mintEnabledOnlyForPrimeHolder && prime == address(0)) {
            return uint256(Error.REJECTION);
        }

        emit MintOnlyForPrimeHolder(mintEnabledOnlyForPrimeHolder, !mintEnabledOnlyForPrimeHolder);
        mintEnabledOnlyForPrimeHolder = !mintEnabledOnlyForPrimeHolder;

        return uint256(Error.NO_ERROR);
    }

    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account total supply balance.
     *  Note that `vTokenBalance` is the number of vTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountAmountLocalVars {
        uint256 oErr;
        MathError mErr;
        uint256 sumSupply;
        uint256 marketSupply;
        uint256 sumBorrowPlusEffects;
        uint256 vTokenBalance;
        uint256 borrowBalance;
        uint256 exchangeRateMantissa;
        uint256 oraclePriceMantissa;
        Exp exchangeRate;
        Exp oraclePrice;
        Exp tokensToDenom;
    }

    /**
     * @notice Function that returns the amount of VAI a user can mint based on their account liquidy and the VAI mint rate
     * If mintEnabledOnlyForPrimeHolder is true, only Prime holders are able to mint VAI
     * @param minter The account to check mintable VAI
     * @return Error code (0=success, otherwise a failure, see ErrorReporter.sol for details)
     * @return Mintable amount (with 18 decimals)
     */
    // solhint-disable-next-line code-complexity
    function getMintableVAI(address minter) public view returns (uint256, uint256) {
        if (mintEnabledOnlyForPrimeHolder && !IPrime(prime).isUserPrimeHolder(minter)) {
            return (uint256(Error.REJECTION), 0);
        }

        PriceOracle oracle = comptroller.oracle();
        VToken[] memory enteredMarkets = comptroller.getAssetsIn(minter);

        AccountAmountLocalVars memory vars; // Holds all our calculation results

        uint256 accountMintableVAI;
        uint256 i;

        /**
         * We use this formula to calculate mintable VAI amount.
         * totalSupplyAmount * VAIMintRate - (totalBorrowAmount + mintedVAIOf)
         */
        uint256 marketsCount = enteredMarkets.length;
        for (i = 0; i < marketsCount; i++) {
            (vars.oErr, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = enteredMarkets[i]
                .getAccountSnapshot(minter);
            if (vars.oErr != 0) {
                // semi-opaque error code, we assume NO_ERROR == 0 is invariant between upgrades
                return (uint256(Error.SNAPSHOT_ERROR), 0);
            }
            vars.exchangeRate = Exp({ mantissa: vars.exchangeRateMantissa });

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(enteredMarkets[i]);
            if (vars.oraclePriceMantissa == 0) {
                return (uint256(Error.PRICE_ERROR), 0);
            }
            vars.oraclePrice = Exp({ mantissa: vars.oraclePriceMantissa });

            (vars.mErr, vars.tokensToDenom) = mulExp(vars.exchangeRate, vars.oraclePrice);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint256(Error.MATH_ERROR), 0);
            }

            // marketSupply = tokensToDenom * vTokenBalance
            (vars.mErr, vars.marketSupply) = mulScalarTruncate(vars.tokensToDenom, vars.vTokenBalance);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint256(Error.MATH_ERROR), 0);
            }

            (, uint256 collateralFactorMantissa) = comptroller.markets(address(enteredMarkets[i]));
            (vars.mErr, vars.marketSupply) = mulUInt(vars.marketSupply, collateralFactorMantissa);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint256(Error.MATH_ERROR), 0);
            }

            (vars.mErr, vars.marketSupply) = divUInt(vars.marketSupply, 1e18);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint256(Error.MATH_ERROR), 0);
            }

            (vars.mErr, vars.sumSupply) = addUInt(vars.sumSupply, vars.marketSupply);
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint256(Error.MATH_ERROR), 0);
            }

            // sumBorrowPlusEffects += oraclePrice * borrowBalance
            (vars.mErr, vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(
                vars.oraclePrice,
                vars.borrowBalance,
                vars.sumBorrowPlusEffects
            );
            if (vars.mErr != MathError.NO_ERROR) {
                return (uint256(Error.MATH_ERROR), 0);
            }
        }

        uint256 totalMintedVAI = comptroller.mintedVAIs(minter);
        uint256 repayAmount = 0;

        if (totalMintedVAI > 0) {
            repayAmount = getVAIRepayAmount(minter);
        }

        (vars.mErr, vars.sumBorrowPlusEffects) = addUInt(vars.sumBorrowPlusEffects, repayAmount);
        if (vars.mErr != MathError.NO_ERROR) {
            return (uint256(Error.MATH_ERROR), 0);
        }

        (vars.mErr, accountMintableVAI) = mulUInt(vars.sumSupply, comptroller.vaiMintRate());
        require(vars.mErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        (vars.mErr, accountMintableVAI) = divUInt(accountMintableVAI, 10000);
        require(vars.mErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        (vars.mErr, accountMintableVAI) = subUInt(accountMintableVAI, vars.sumBorrowPlusEffects);
        if (vars.mErr != MathError.NO_ERROR) {
            return (uint256(Error.REJECTION), 0);
        }

        return (uint256(Error.NO_ERROR), accountMintableVAI);
    }

    /**
     * @notice Update treasury data
     * @param newTreasuryGuardian New Treasury Guardian address
     * @param newTreasuryAddress New Treasury Address
     * @param newTreasuryPercent New fee percentage for minting VAI that is sent to the treasury
     */
    function _setTreasuryData(
        address newTreasuryGuardian,
        address newTreasuryAddress,
        uint256 newTreasuryPercent
    ) external returns (uint256) {
        // Check caller is admin
        if (!(msg.sender == admin || msg.sender == treasuryGuardian)) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_TREASURY_OWNER_CHECK);
        }

        require(newTreasuryPercent < 1e18, "treasury percent cap overflow");

        address oldTreasuryGuardian = treasuryGuardian;
        address oldTreasuryAddress = treasuryAddress;
        uint256 oldTreasuryPercent = treasuryPercent;

        treasuryGuardian = newTreasuryGuardian;
        treasuryAddress = newTreasuryAddress;
        treasuryPercent = newTreasuryPercent;

        emit NewTreasuryGuardian(oldTreasuryGuardian, newTreasuryGuardian);
        emit NewTreasuryAddress(oldTreasuryAddress, newTreasuryAddress);
        emit NewTreasuryPercent(oldTreasuryPercent, newTreasuryPercent);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Gets yearly VAI interest rate based on the VAI price
     * @return uint256 Yearly VAI interest rate
     */
    function getVAIRepayRate() public view returns (uint256) {
        PriceOracle oracle = comptroller.oracle();
        MathError mErr;

        if (baseRateMantissa > 0) {
            if (floatRateMantissa > 0) {
                uint256 oraclePrice = oracle.getUnderlyingPrice(VToken(getVAIAddress()));
                if (1e18 > oraclePrice) {
                    uint256 delta;
                    uint256 rate;

                    (mErr, delta) = subUInt(1e18, oraclePrice);
                    require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

                    (mErr, delta) = mulUInt(delta, floatRateMantissa);
                    require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

                    (mErr, delta) = divUInt(delta, 1e18);
                    require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

                    (mErr, rate) = addUInt(delta, baseRateMantissa);
                    require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

                    return rate;
                } else {
                    return baseRateMantissa;
                }
            } else {
                return baseRateMantissa;
            }
        } else {
            return 0;
        }
    }

    /**
     * @notice Get interest rate per block
     * @return uint256 Interest rate per bock
     */
    function getVAIRepayRatePerBlock() public view returns (uint256) {
        uint256 yearlyRate = getVAIRepayRate();

        MathError mErr;
        uint256 rate;

        (mErr, rate) = divUInt(yearlyRate, getBlocksPerYear());
        require(mErr == MathError.NO_ERROR, "VAI_REPAY_RATE_CALCULATION_FAILED");

        return rate;
    }

    /**
     * @notice Get the last updated interest index for a VAI Minter
     * @param minter Address of VAI minter
     * @return uint256 Returns the interest rate index for a minter
     */
    function getVAIMinterInterestIndex(address minter) public view returns (uint256) {
        uint256 storedIndex = vaiMinterInterestIndex[minter];
        // If the user minted VAI before the stability fee was introduced, accrue
        // starting from stability fee launch
        if (storedIndex == 0) {
            return INITIAL_VAI_MINT_INDEX;
        }
        return storedIndex;
    }

    /**
     * @notice Get the current total VAI a user needs to repay
     * @param account The address of the VAI borrower
     * @return (uint256) The total amount of VAI the user needs to repay
     */
    function getVAIRepayAmount(address account) public view returns (uint256) {
        MathError mErr;
        uint256 delta;

        uint256 amount = comptroller.mintedVAIs(account);
        uint256 interest = pastVAIInterest[account];
        uint256 totalMintedVAI;
        uint256 newInterest;

        (mErr, totalMintedVAI) = subUInt(amount, interest);
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        (mErr, delta) = subUInt(vaiMintIndex, getVAIMinterInterestIndex(account));
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        (mErr, newInterest) = mulUInt(delta, totalMintedVAI);
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        (mErr, newInterest) = divUInt(newInterest, 1e18);
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        (mErr, amount) = addUInt(amount, newInterest);
        require(mErr == MathError.NO_ERROR, "VAI_TOTAL_REPAY_AMOUNT_CALCULATION_FAILED");

        return amount;
    }

    /**
     * @notice Calculate how much VAI the user needs to repay
     * @param borrower The address of the VAI borrower
     * @param repayAmount The amount of VAI being returned
     * @return Amount of VAI to be burned
     * @return Amount of VAI the user needs to pay in current interest
     * @return Amount of VAI the user needs to pay in past interest
     */
    function getVAICalculateRepayAmount(
        address borrower,
        uint256 repayAmount
    ) public view returns (uint256, uint256, uint256) {
        MathError mErr;
        uint256 totalRepayAmount = getVAIRepayAmount(borrower);
        uint256 currentInterest;

        (mErr, currentInterest) = subUInt(totalRepayAmount, comptroller.mintedVAIs(borrower));
        require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");

        (mErr, currentInterest) = addUInt(pastVAIInterest[borrower], currentInterest);
        require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");

        uint256 burn;
        uint256 partOfCurrentInterest = currentInterest;
        uint256 partOfPastInterest = pastVAIInterest[borrower];

        if (repayAmount >= totalRepayAmount) {
            (mErr, burn) = subUInt(totalRepayAmount, currentInterest);
            require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");
        } else {
            uint256 delta;

            (mErr, delta) = mulUInt(repayAmount, 1e18);
            require(mErr == MathError.NO_ERROR, "VAI_PART_CALCULATION_FAILED");

            (mErr, delta) = divUInt(delta, totalRepayAmount);
            require(mErr == MathError.NO_ERROR, "VAI_PART_CALCULATION_FAILED");

            uint256 totalMintedAmount;
            (mErr, totalMintedAmount) = subUInt(totalRepayAmount, currentInterest);
            require(mErr == MathError.NO_ERROR, "VAI_MINTED_AMOUNT_CALCULATION_FAILED");

            (mErr, burn) = mulUInt(totalMintedAmount, delta);
            require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");

            (mErr, burn) = divUInt(burn, 1e18);
            require(mErr == MathError.NO_ERROR, "VAI_BURN_AMOUNT_CALCULATION_FAILED");

            (mErr, partOfCurrentInterest) = mulUInt(currentInterest, delta);
            require(mErr == MathError.NO_ERROR, "VAI_CURRENT_INTEREST_AMOUNT_CALCULATION_FAILED");

            (mErr, partOfCurrentInterest) = divUInt(partOfCurrentInterest, 1e18);
            require(mErr == MathError.NO_ERROR, "VAI_CURRENT_INTEREST_AMOUNT_CALCULATION_FAILED");

            (mErr, partOfPastInterest) = mulUInt(pastVAIInterest[borrower], delta);
            require(mErr == MathError.NO_ERROR, "VAI_PAST_INTEREST_CALCULATION_FAILED");

            (mErr, partOfPastInterest) = divUInt(partOfPastInterest, 1e18);
            require(mErr == MathError.NO_ERROR, "VAI_PAST_INTEREST_CALCULATION_FAILED");
        }

        return (burn, partOfCurrentInterest, partOfPastInterest);
    }

    /**
     * @notice Accrue interest on outstanding minted VAI
     */
    function accrueVAIInterest() public {
        MathError mErr;
        uint256 delta;

        (mErr, delta) = mulUInt(getVAIRepayRatePerBlock(), getBlockNumber() - accrualBlockNumber);
        require(mErr == MathError.NO_ERROR, "VAI_INTEREST_ACCRUE_FAILED");

        (mErr, delta) = addUInt(delta, vaiMintIndex);
        require(mErr == MathError.NO_ERROR, "VAI_INTEREST_ACCRUE_FAILED");

        vaiMintIndex = delta;
        accrualBlockNumber = getBlockNumber();
    }

    /**
     * @notice Sets the address of the access control of this contract
     * @dev Admin function to set the access control address
     * @param newAccessControlAddress New address for the access control
     */
    function setAccessControl(address newAccessControlAddress) external onlyAdmin {
        _ensureNonzeroAddress(newAccessControlAddress);

        address oldAccessControlAddress = accessControl;
        accessControl = newAccessControlAddress;
        emit NewAccessControl(oldAccessControlAddress, accessControl);
    }

    /**
     * @notice Set VAI borrow base rate
     * @param newBaseRateMantissa the base rate multiplied by 10**18
     */
    function setBaseRate(uint256 newBaseRateMantissa) external {
        _ensureAllowed("setBaseRate(uint256)");

        uint256 old = baseRateMantissa;
        baseRateMantissa = newBaseRateMantissa;
        emit NewVAIBaseRate(old, baseRateMantissa);
    }

    /**
     * @notice Set VAI borrow float rate
     * @param newFloatRateMantissa the VAI float rate multiplied by 10**18
     */
    function setFloatRate(uint256 newFloatRateMantissa) external {
        _ensureAllowed("setFloatRate(uint256)");

        uint256 old = floatRateMantissa;
        floatRateMantissa = newFloatRateMantissa;
        emit NewVAIFloatRate(old, floatRateMantissa);
    }

    /**
     * @notice Set VAI stability fee receiver address
     * @param newReceiver the address of the VAI fee receiver
     */
    function setReceiver(address newReceiver) external onlyAdmin {
        _ensureNonzeroAddress(newReceiver);

        address old = receiver;
        receiver = newReceiver;
        emit NewVAIReceiver(old, newReceiver);
    }

    /**
     * @notice Set VAI mint cap
     * @param _mintCap the amount of VAI that can be minted
     */
    function setMintCap(uint256 _mintCap) external {
        _ensureAllowed("setMintCap(uint256)");

        uint256 old = mintCap;
        mintCap = _mintCap;
        emit NewVAIMintCap(old, _mintCap);
    }

    function getBlockNumber() internal view returns (uint256) {
        return block.number;
    }

    function getBlocksPerYear() public view returns (uint256) {
        return 10512000; //(24 * 60 * 60 * 365) / 3;
    }

    /**
     * @notice Return the address of the VAI token
     * @return The address of VAI
     */
    function getVAIAddress() public view returns (address) {
        return vai;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    /*** Reentrancy Guard ***/

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     */
    modifier nonReentrant() {
        require(_notEntered, "re-entered");
        _notEntered = false;
        _;
        _notEntered = true; // get a gas-refund post-Istanbul
    }

    function _ensureAllowed(string memory functionSig) private view {
        require(IAccessControlManagerV5(accessControl).isAllowedToCall(msg.sender, functionSig), "access denied");
    }

    /// @dev Reverts if the protocol is paused
    function _ensureNotPaused() private view {
        require(!comptroller.protocolPaused(), "protocol is paused");
    }

    /// @dev Reverts if the passed address is zero
    function _ensureNonzeroAddress(address someone) private pure {
        require(someone != address(0), "can't be zero address");
    }

    /// @dev Reverts if the passed amount is zero
    function _ensureNonzeroAmount(uint256 amount) private pure {
        require(amount > 0, "amount can't be zero");
    }
}
