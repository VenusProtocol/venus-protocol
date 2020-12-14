pragma solidity ^0.5.16;

import "./VBep20.sol";
import "./VToken.sol";
import "./PriceOracle.sol";

interface V1PriceOracleInterface {
    function assetPrices(address asset) external view returns (uint);
}

contract PriceOracleProxy is PriceOracle {
    /// @notice Indicator that this is a PriceOracle contract (for inspection)
    bool public constant isPriceOracle = true;

    /// @notice The v1 price oracle, which will continue to serve prices for v1 assets
    V1PriceOracleInterface public v1PriceOracle;

    /// @notice Address of the guardian, which may set the SAI price once
    address public guardian;

    /// @notice Address of the vBnb contract, which has a constant price
    address public vBnbAddress;

    /// @notice Address of the vUSDC contract, which we hand pick a key for
    address public vUsdcAddress;

    /// @notice Address of the vUSDT contract, which uses the vUSDC price
    address public vUsdtAddress;

    /// @notice Address of the vSAI contract, which may have its price set
    address public vSaiAddress;

    /// @notice Address of the vDAI contract, which we hand pick a key for
    address public vDaiAddress;

    /// @notice Handpicked key for USDC
    address public constant usdcOracleKey = address(1);

    /// @notice Handpicked key for DAI
    address public constant daiOracleKey = address(2);

    /// @notice Frozen SAI price (or 0 if not set yet)
    uint public saiPrice;

    /**
     * @param guardian_ The address of the guardian, which may set the SAI price once
     * @param v1PriceOracle_ The address of the v1 price oracle, which will continue to operate and hold prices for collateral assets
     * @param vBnbAddress_ The address of vBNB, which will return a constant 1e18, since all prices relative to bnb
     * @param vUsdcAddress_ The address of vUSDC, which will be read from a special oracle key
     * @param vSaiAddress_ The address of vSAI, which may be read directly from storage
     * @param vDaiAddress_ The address of vDAI, which will be read from a special oracle key
     * @param vUsdtAddress_ The address of vUSDT, which uses the vUSDC price
     */
    constructor(address guardian_,
                address v1PriceOracle_,
                address vBnbAddress_,
                address vUsdcAddress_,
                address vSaiAddress_,
                address vDaiAddress_,
                address vUsdtAddress_) public {
        guardian = guardian_;
        v1PriceOracle = V1PriceOracleInterface(v1PriceOracle_);

        vBnbAddress = vBnbAddress_;
        vUsdcAddress = vUsdcAddress_;
        vSaiAddress = vSaiAddress_;
        vDaiAddress = vDaiAddress_;
        vUsdtAddress = vUsdtAddress_;
    }

    /**
     * @notice Get the underlying price of a listed vToken asset
     * @param vToken The vToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18)
     */
    function getUnderlyingPrice(VToken vToken) public view returns (uint) {
        address vTokenAddress = address(vToken);

        if (vTokenAddress == vBnbAddress) {
            // bnb always worth 1
            return 1e18;
        }

        if (vTokenAddress == vUsdcAddress || vTokenAddress == vUsdtAddress) {
            return v1PriceOracle.assetPrices(usdcOracleKey);
        }

        if (vTokenAddress == vDaiAddress) {
            return v1PriceOracle.assetPrices(daiOracleKey);
        }

        if (vTokenAddress == vSaiAddress) {
            // use the frozen SAI price if set, otherwise use the DAI price
            return saiPrice > 0 ? saiPrice : v1PriceOracle.assetPrices(daiOracleKey);
        }

        // otherwise just read from v1 oracle
        address underlying = VBep20(vTokenAddress).underlying();
        return v1PriceOracle.assetPrices(underlying);
    }

    /**
     * @notice Set the price of SAI, permanently
     * @param price The price for SAI
     */
    function setSaiPrice(uint price) public {
        require(msg.sender == guardian, "only guardian may set the SAI price");
        require(saiPrice == 0, "SAI price may only be set once");
        require(price < 0.1e18, "SAI price must be < 0.1 BNB");
        saiPrice = price;
    }
}
