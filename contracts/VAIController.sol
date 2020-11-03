pragma solidity ^0.5.16;

import "./VToken.sol";
import "./PriceOracle.sol";
import "./ErrorReporter.sol";
import "./Exponential.sol";
import "./ComptrollerStorage.sol";
import "./VAIControllerStorage.sol";
import "./VAIUnitroller.sol";
import "./VAI/VAI.sol";

interface ComptrollerLensInterface {
    function getAllMarkets() external view returns (VToken[] memory);
    function oracle() external view returns (PriceOracle);
}

/**
 * @title Venus's VAI Comptroller Contract
 * @author Venus
 */
contract VAIController is VAIControllerStorage, VAIControllerErrorReporter, Exponential {

    /// @notice Emitted when Comptroller is changed
    event NewComptroller(ComptrollerInterface oldComptroller, ComptrollerInterface newComptroller);

    function _become(VAIUnitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        require(unitroller._acceptImplementation() == 0, "change not authorized");
    }

    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account total supply balance.
     *  Note that `vTokenBalance` is the number of vTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountAmountLocalVars {
        uint totalSupplyAmount;
        uint sumSupply;
        uint sumBorrowPlusEffects;
        uint vTokenBalance;
        uint borrowBalance;
        uint exchangeRateMantissa;
        uint oraclePriceMantissa;
        Exp collateralFactor;
        Exp exchangeRate;
        Exp oraclePrice;
        Exp tokensToDenom;
    }

    function mintVAI(address minter, uint mintVAIAmount) external returns (uint) {
        // Check caller is comptroller
        if (msg.sender != address(comptroller)) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }

        PriceOracle oracle = ComptrollerLensInterface(address(comptroller)).oracle();
        VToken[] memory allMarkets = ComptrollerLensInterface(address(comptroller)).getAllMarkets();

        AccountAmountLocalVars memory vars; // Holds all our calculation results

        uint oErr;
        MathError mErr;

        uint accountMintableVAI;
        uint accountMintVAINew;
        uint i;

        /**
         * We use this formula to calculate mintable VAI amount.
         * totalSupplyAmount * VAIMintRate - (totalBorrowAmount + mintedVAIOf)
         */
        for (i = 0; i < allMarkets.length; i++) {
            (oErr, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = allMarkets[i].getAccountSnapshot(minter);
            if (oErr != 0) { // semi-opaque error code, we assume NO_ERROR == 0 is invariant between upgrades
                return uint(Error.SNAPSHOT_ERROR);
            }
            vars.exchangeRate = Exp({mantissa: vars.exchangeRateMantissa});

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(allMarkets[i]);
            if (vars.oraclePriceMantissa == 0) {
                return uint(Error.PRICE_ERROR);
            }
            vars.oraclePrice = Exp({mantissa: vars.oraclePriceMantissa});

            (mErr, vars.tokensToDenom) = mulExp(vars.exchangeRate, vars.oraclePrice);
            if (mErr != MathError.NO_ERROR) {
                return uint(Error.MATH_ERROR);
            }
            
            // sumSupply += tokensToDenom * vTokenBalance
            (mErr, vars.sumSupply) = mulScalarTruncateAddUInt(vars.tokensToDenom, vars.vTokenBalance, vars.sumSupply);
            if (mErr != MathError.NO_ERROR) {
                return uint(Error.MATH_ERROR);
            }

            // sumBorrowPlusEffects += oraclePrice * borrowBalance
            (mErr, vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(vars.oraclePrice, vars.borrowBalance, vars.sumBorrowPlusEffects);
            if (mErr != MathError.NO_ERROR) {
                return uint(Error.MATH_ERROR);
            }
        }
        
        (mErr, vars.sumBorrowPlusEffects) = addUInt(vars.sumBorrowPlusEffects, comptroller.mintedVAIOf(minter));
        if (mErr != MathError.NO_ERROR) {
            return uint(Error.MATH_ERROR);
        }

        (mErr, accountMintableVAI) = mulUInt(vars.sumSupply, comptroller.getVAIMintRate());
        require(mErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        (mErr, accountMintableVAI) = divUInt(accountMintableVAI, 10000);
        require(mErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        
        (mErr, accountMintableVAI) = subUInt(accountMintableVAI, vars.sumBorrowPlusEffects);
        if (mErr != MathError.NO_ERROR) {
            return fail(Error.REJECTION, FailureInfo.VAI_MINT_REJECTION);
        }

        // check that user have sufficient mintableVAI balance
        if (mintVAIAmount > accountMintableVAI) {
            return fail(Error.REJECTION, FailureInfo.VAI_MINT_REJECTION);
        }

        VAI(getVAIAddress()).mint(minter, mintVAIAmount);
        (mErr, accountMintVAINew) = addUInt(comptroller.mintedVAIOf(minter), mintVAIAmount);
        require(mErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        comptroller.setMintedVAIOf(minter, accountMintVAINew);
    }
    
    /**
     * @notice Repay VAI
     */
    function repayVAI(address repayer, uint repayVAIAmount) external returns (uint) {
        // Check caller is comptroller
        if (msg.sender != address(comptroller)) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }
        
        uint actualBurnAmount = 0;

        uint vaiBalance = comptroller.mintedVAIOf(repayer);
        
        if(vaiBalance > repayVAIAmount) {
            actualBurnAmount = repayVAIAmount;
        } else {
            actualBurnAmount = vaiBalance;
        }

        VAI(getVAIAddress()).burn(repayer, actualBurnAmount);
        comptroller.setMintedVAIOf(repayer, vaiBalance - actualBurnAmount);
    }

    /** Admin Functions */

    /**
      * @notice Sets a new comptroller
      * @dev Admin function to set a new comptroller
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setComptroller(ComptrollerInterface comptroller_) public returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }

        ComptrollerInterface oldComptroller = comptroller;
        comptroller = comptroller_;
        emit NewComptroller(oldComptroller, comptroller_);
    }

    /**
     * @notice Return the address of the VAI token
     * @return The address of VAI
     */
    function getVAIAddress() public view returns (address) {
        return 0x0A87C5BdeC19d74BEE9938F928bfa153bc8532b2;
    }
}
