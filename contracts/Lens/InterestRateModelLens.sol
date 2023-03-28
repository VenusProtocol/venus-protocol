pragma solidity 0.8.13;

import "../InterestRateModels/V0.8.13/InterestRateModel.sol";

contract InterestRateModelLens {
    struct SimulationResponse {
        uint256[] borrowSimulation;
        uint256[] supplySimulation;
    }

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
            uint cash = (percent_Factor*referenceAmountInWei)/1e2;
            uint256 borrowRate = ir.getBorrowRate(cash, borrow, reserves);
            borrowSimulation[percent_Factor - 1] = borrowRate;

            uint256 supplyRate = ir.getSupplyRate(cash, borrow, reserves, reserveFactorMantissa);
            supplySimulation[percent_Factor - 1] = supplyRate;
        }

        return SimulationResponse({ borrowSimulation: borrowSimulation, supplySimulation: supplySimulation });
    }
}
