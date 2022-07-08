pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../VToken.sol";
import "../SafeMath.sol";
import "../Comptroller.sol";
import "../EIP20Interface.sol";
import "../VBep20.sol";

contract SnapshotLens is ExponentialNoError {
    using SafeMath for uint256;

    struct AccountSnapshot {
        address account;
        string assetName;
        address vTokenAddress;
        address underlyingAssetAddress;
        uint256 supply;
        uint256 supplyInUsd;
        uint256 collateral;
        uint256 borrows;
        uint256 borrowsInUsd;
        uint256 assetPrice;
        uint256 accruedInterest;
        uint vTokenDecimals;
        uint underlyingDecimals;
        uint exchangeRate;
    }

    /** Snapshot calculation **/
    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account snapshot.
     *  Note that `vTokenBalance` is the number of vTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountSnapshotLocalVars {
        uint collateral;
        uint vTokenBalance;
        uint borrowBalance;
        uint borrowsInUsd;
        uint balanceOfUnderlying;
        uint supplyInUsd;
        uint exchangeRateMantissa;
        uint oraclePriceMantissa;
        Exp collateralFactor;
        Exp exchangeRate;
        Exp oraclePrice;
        Exp tokensToDenom;
    }

    function getAccountSnapshot(
        address payable account,
        address comptrollerAddress
    )  public returns (AccountSnapshot[] memory) {

        // For each asset the account is in
        VToken[] memory assets = Comptroller(comptrollerAddress).getAssetsIn(account);
        uint assetsCount = assets.length;
        AccountSnapshot[] memory accountSnapshots = new AccountSnapshot[](assetsCount);

        for (uint i = 0; i < assetsCount; ++i) {
            accountSnapshots[i] = getAccountSnapshot(account, comptrollerAddress, assets[i]);
        }

        return accountSnapshots;
    }

    function getAccountSnapshot(
        address payable account,
        address comptrollerAddress,
        VToken vToken
    ) public returns (AccountSnapshot memory) {

        AccountSnapshotLocalVars memory vars; // Holds all our calculation results
        uint oErr;

        // Read the balances and exchange rate from the vToken
        (oErr, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = vToken.getAccountSnapshot(account);
        require(oErr == 0, "Snapshot Error");
        vars.exchangeRate = Exp({mantissa: vars.exchangeRateMantissa});

        Comptroller comptrollerInstance = Comptroller(comptrollerAddress);

        (, uint collateralFactorMantissa,) = comptrollerInstance.markets(address(vToken));
        vars.collateralFactor = Exp({mantissa: collateralFactorMantissa});

        // Get the normalized price of the asset
        vars.oraclePriceMantissa = comptrollerInstance.oracle().getUnderlyingPrice(vToken);
        vars.oraclePrice = Exp({mantissa: vars.oraclePriceMantissa});

        // Pre-compute a conversion factor from tokens -> bnb (normalized price value)
        vars.tokensToDenom = mul_(mul_(vars.collateralFactor, vars.exchangeRate), vars.oraclePrice);

        //Collateral = tokensToDenom * vTokenBalance
        vars.collateral = mul_ScalarTruncate(vars.tokensToDenom, vars.vTokenBalance);

        vars.balanceOfUnderlying = vToken.balanceOfUnderlying(account);
        vars.supplyInUsd = mul_ScalarTruncate(vars.oraclePrice, vars.balanceOfUnderlying);

        vars.borrowsInUsd = mul_ScalarTruncate(vars.oraclePrice, vars.borrowBalance);

        address underlyingAssetAddress;
        uint underlyingDecimals;

        if (compareStrings(vToken.symbol(), "vBNB")) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            VBep20 vBep20 = VBep20(address(vToken));
            underlyingAssetAddress = vBep20.underlying();
            underlyingDecimals = EIP20Interface(vBep20.underlying()).decimals();
        }
        
        return AccountSnapshot({
            account: account,
            assetName: vToken.name(),
            vTokenAddress: address(vToken),
            underlyingAssetAddress: underlyingAssetAddress,
            supply: vars.balanceOfUnderlying,
            supplyInUsd: vars.supplyInUsd,
            collateral: vars.collateral,
            borrows: vars.borrowBalance,
            borrowsInUsd: vars.borrowsInUsd,
            assetPrice: vars.oraclePriceMantissa,
            accruedInterest: vToken.borrowIndex(),
            vTokenDecimals: vToken.decimals(),
            underlyingDecimals: underlyingDecimals,
            exchangeRate: vToken.exchangeRateCurrent()
        });
    }

    // utilities
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
