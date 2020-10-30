pragma solidity ^0.5.16;

import "./VToken.sol";
import "./PriceOracle.sol";
import "./ErrorReporter.sol";
import "./Exponential.sol";
import "./ComptrollerStorage.sol";
import "./VAIControllerStorage.sol";
import "./VAIUnitroller.sol";
import "./VAI/VAI.sol";

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

    function mintVAI(address oracle, address vToken, address minter, uint actualMintAmount) external returns (uint) {
        // Check caller is comptroller
        if (msg.sender != address(comptroller)) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }

        MathError mathErr;
        uint accountMintableVAI;
        uint accountMintedVAINew;

        /*
         * We get the current underlying price and calculate the number of VAIs to be minted:
         *  accountMintedVAINew = mintedVAIs[minter] + (getUnderlyingPrice * actualMintAmount) / 2;
         */
        uint assetPrice = PriceOracle(oracle).getUnderlyingPrice(VToken(vToken));
        require(assetPrice != 0, "VAI_MINT_UNDERLYING_PRICE_ERROR");
        
        Exp memory oraclePrice = Exp({mantissa: assetPrice});
        (mathErr, accountMintableVAI) = mulScalarTruncate(oraclePrice, actualMintAmount);
        require(mathErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        (mathErr, accountMintableVAI) = mulUInt(accountMintableVAI, comptroller.getVAIMintRate());
        require(mathErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        (mathErr, accountMintableVAI) = divUInt(accountMintableVAI, 10000);
        require(mathErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        (mathErr, accountMintedVAINew) = addUInt(comptroller.mintedVAIOf(minter), accountMintableVAI);
        require(mathErr == MathError.NO_ERROR, "VAI_MINT_AMOUNT_CALCULATION_FAILED");

        VAI(getVAIAddress()).mint(minter, accountMintableVAI);
        comptroller.setMintedVAIOf(minter, accountMintedVAINew);
    }

    /**
     * @notice Return the address of the VAI token
     * @return The address of VAI
     */
    function getVAIAddress() public view returns (address) {
        return 0x0A87C5BdeC19d74BEE9938F928bfa153bc8532b2;
    }
    
    /**
     * @notice Repay VAI
     */
    function repayVAI(address repayer, uint repayVAIAmount) external returns (uint) {
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
}
