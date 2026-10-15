// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { Test } from "forge-std/Test.sol";

import { ComptrollerInterface } from "../../contracts/Comptroller/ComptrollerInterface.sol";
import { Diamond } from "../../contracts/Comptroller/Diamond/Diamond.sol";
import { FlashLoanFacet } from "../../contracts/Comptroller/Diamond/facets/FlashLoanFacet.sol";
import { MarketFacet } from "../../contracts/Comptroller/Diamond/facets/MarketFacet.sol";
import { PolicyFacet } from "../../contracts/Comptroller/Diamond/facets/PolicyFacet.sol";
import { RewardFacet } from "../../contracts/Comptroller/Diamond/facets/RewardFacet.sol";
import { SetterFacet } from "../../contracts/Comptroller/Diamond/facets/SetterFacet.sol";
import { IDiamondCut } from "../../contracts/Comptroller/Diamond/interfaces/IDiamondCut.sol";
import { Unitroller } from "../../contracts/Comptroller/Unitroller.sol";
import { InterestRateModelV8 } from "../../contracts/InterestRateModels/InterestRateModelV8.sol";
import { TwoKinksInterestRateModel } from "../../contracts/InterestRateModels/TwoKinksInterestRateModel.sol";
import { ComptrollerLens } from "../../contracts/Lens/ComptrollerLens.sol";
import { VBep20Immutable } from "../../contracts/Tokens/VTokens/VBep20Immutable.sol";
import { VToken } from "../../contracts/Tokens/VTokens/VToken.sol";
import { AccessControlManagerMock } from "../../contracts/test/AccessControlManagerMock.sol";
import { ComptrollerMock } from "../../contracts/test/ComptrollerMock.sol";
import { MockToken } from "../../contracts/test/MockToken.sol";
import { MockResilientOracle } from "./mocks/MockResilientOracle.sol";

/// @notice The deployment every suite here starts from, kept at the root of tests/foundry so that
///  no directory has to reach into another's fixtures.
///
///  `_deployComptroller` assembles a real Comptroller: a Unitroller fronting a Diamond with all
///  five facets cut in, reachable through the `ComptrollerMock` ABI (which inherits every facet
///  but performs no delegation of its own, so it is only a typed view onto the diamond).
///  `_deployMarket` lists one real VBep20Immutable on it. Only the oracle is a double.
///
/// @dev The deployment mirrors tests/hardhat/Comptroller/Diamond/scripts/deploy.ts, including how
///  it gets each facet's selectors: from the facet interface's ABI, here read out of its forge
///  artifact. A function added to an interface is therefore cut in with no change to this file.
abstract contract ProtocolBase is Test {
    ComptrollerMock internal comptroller;
    Unitroller internal unitroller;
    Diamond internal diamond;
    ComptrollerLens internal comptrollerLens;
    AccessControlManagerMock internal accessControl;

    MockToken internal underlying;
    VBep20Immutable internal vToken;
    TwoKinksInterestRateModel internal rateModel;
    MockResilientOracle internal oracle;

    uint8 internal constant UNDERLYING_DECIMALS = 18;
    uint8 internal constant VTOKEN_DECIMALS = 8;

    /// @dev exchangeRate is underlying-per-vToken scaled by 1e18, so with an 18-decimal underlying
    ///  and an 8-decimal vToken, 1e28 is the rate at which one whole vToken is one whole token.
    uint256 internal constant INITIAL_EXCHANGE_RATE = 1e28;

    uint256 internal constant UNDERLYING_PRICE = 1e18;
    uint256 internal constant COLLATERAL_FACTOR = 0.8e18;
    uint256 internal constant LIQUIDATION_THRESHOLD = 0.9e18;

    /// @dev Every facet inherits FacetBase, so its selectors are inlined into all of them but may
    ///  only be registered once. Hardhat's deploy script routes them through RewardFacet and this
    ///  keeps that choice, so the two fixtures produce the same diamond.
    function _deployComptroller() internal {
        unitroller = new Unitroller();
        diamond = new Diamond();

        unitroller._setPendingImplementation(address(diamond));
        diamond._become(unitroller);

        address marketFacet = address(new MarketFacet());
        address policyFacet = address(new PolicyFacet());
        address rewardFacet = address(new RewardFacet());
        address setterFacet = address(new SetterFacet());
        address flashLoanFacet = address(new FlashLoanFacet());

        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](6);
        cut[0] = _add(marketFacet, "IMarketFacet");
        cut[1] = _add(policyFacet, "IPolicyFacet");
        cut[2] = _add(rewardFacet, "IRewardFacet");
        cut[3] = _add(setterFacet, "ISetterFacet");
        cut[4] = _add(flashLoanFacet, "IFlashLoanFacet");
        cut[5] = _add(rewardFacet, "IFacetBase");

        Diamond(payable(address(unitroller))).diamondCut(cut);

        comptroller = ComptrollerMock(payable(address(unitroller)));

        accessControl = new AccessControlManagerMock(address(this));
        comptrollerLens = new ComptrollerLens();
        comptroller._setAccessControl(address(accessControl));
        comptroller._setComptrollerLens(comptrollerLens);
    }

    function _deployMarket() internal {
        _deployComptroller();

        oracle = new MockResilientOracle();
        comptroller._setPriceOracle(ResilientOracleInterface(address(oracle)));
        comptroller.setDeviationBoundedOracle(IDeviationBoundedOracle(address(oracle)));

        underlying = new MockToken("Mock Token", "MOCK", UNDERLYING_DECIMALS);

        // BSC block cadence, and the kinks the core pool markets are configured with.
        rateModel = new TwoKinksInterestRateModel({
            baseRatePerYear_: 0,
            multiplierPerYear_: 0.15e18,
            kink1_: 0.8e18,
            multiplier2PerYear_: 0.9e18,
            baseRate2PerYear_: 0,
            kink2_: 0.9e18,
            jumpMultiplierPerYear_: 3e18,
            blocksPerYear_: 10_512_000
        });

        vToken = new VBep20Immutable({
            underlying_: address(underlying),
            comptroller_: ComptrollerInterface(address(comptroller)),
            interestRateModel_: InterestRateModelV8(address(rateModel)),
            initialExchangeRateMantissa_: INITIAL_EXCHANGE_RATE,
            name_: "Venus Mock",
            symbol_: "vMOCK",
            decimals_: VTOKEN_DECIMALS,
            admin_: payable(address(this))
        });

        oracle.setUnderlyingPrice(address(vToken), UNDERLYING_PRICE);

        comptroller._supportMarket(VToken(address(vToken)));

        VToken[] memory markets = new VToken[](1);
        markets[0] = VToken(address(vToken));
        uint256[] memory caps = new uint256[](1);
        caps[0] = type(uint256).max;
        comptroller._setMarketSupplyCaps(markets, caps);
        comptroller._setMarketBorrowCaps(markets, caps);

        comptroller.setCollateralFactor(VToken(address(vToken)), COLLATERAL_FACTOR, LIQUIDATION_THRESHOLD);

        // Borrowing is off by default on a freshly listed market.
        comptroller.setIsBorrowAllowed(comptroller.corePoolId(), address(vToken), true);
    }

    function _add(address facet, string memory iface) private view returns (IDiamondCut.FacetCut memory) {
        string memory artifact = vm.readFile(string.concat("out/", iface, ".sol/", iface, ".json"));
        string[] memory signatures = vm.parseJsonKeys(artifact, ".methodIdentifiers");
        bytes4[] memory selectors = new bytes4[](signatures.length);
        for (uint256 i; i < signatures.length; ++i) {
            selectors[i] = bytes4(keccak256(bytes(signatures[i])));
        }
        return
            IDiamondCut.FacetCut({
                facetAddress: facet,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: selectors
            });
    }
}
