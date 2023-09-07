pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../InterestRateModels/InterestRateModel.sol";
import "../Utils/SafeMath.sol";

/**
 * @title InterestRateModelLens Contract
 * @author Venus
 * @notice Lens for querying interest rate model simulations
 */
contract InterestRateModelLens {
    using SafeMath for uint256;

    struct SimulationResponse {
        uint256[] borrowSimulation;
        uint256[] supplySimulation;
    }

    /**
     * @notice Simulate interest rate curve fo a specific interest rate model given a reference borrow amount and reserve factor
     * @param referenceAmountInWei Borrow amount to use in simulation
     * @param interestRateModel Address for interest rate model to simulate
     * @param reserveFactorMantissa Reserve Factor to use in simulation
     * @return SimulationResponse struct with array of borrow simulations and an array of supply simulations
     */
    function getSimulationResponse(
        uint referenceAmountInWei,
        address interestRateModel,
        uint reserveFactorMantissa
    ) external view returns (SimulationResponse memory) {
        InterestRateModel ir = InterestRateModel(interestRateModel);

        uint256[] memory borrowSimulation = new uint256[](100);
        uint256[] memory supplySimulation = new uint256[](100);

        uint borrow = referenceAmountInWei;
        uint reserves = 0;

        for (uint percent_Factor = 1; percent_Factor <= 100; ++percent_Factor) {
            uint cash = (percent_Factor.mul(referenceAmountInWei)).div(1e2);
            uint256 borrowRate = ir.getBorrowRate(cash, borrow, reserves);
            borrowSimulation[percent_Factor - 1] = borrowRate;

            uint256 supplyRate = ir.getSupplyRate(cash, borrow, reserves, reserveFactorMantissa);
            supplySimulation[percent_Factor - 1] = supplyRate;
        }

        return SimulationResponse({ borrowSimulation: borrowSimulation, supplySimulation: supplySimulation });
    }
}
