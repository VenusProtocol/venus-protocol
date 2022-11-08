pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../InterestRateModel.sol";
import "../SafeMath.sol";

contract InterestRateModelLens {

    using SafeMath for uint256;
    
    struct SimulationResponse {
        uint256[] borrowSimulation;
        uint256[] supplySimulation;
    }

    function getSimulationResponse(uint referenceAmountInWei, address interestRateModel, uint reserveFactorMantissa) external view returns (SimulationResponse memory){

        InterestRateModel ir = InterestRateModel(interestRateModel);

        uint256[] memory borrowSimulation = new uint256[](100);
        uint256[] memory supplySimulation = new uint256[](100);

        uint borrow = referenceAmountInWei;
        uint reserves = 0;

        for(uint percent_Factor = 1; percent_Factor <= 100; ++percent_Factor)
        {
            uint cash = (percent_Factor.mul(referenceAmountInWei)).div(1e2);
            uint256 borrowRate = ir.getBorrowRate(cash, borrow, reserves);
            borrowSimulation[percent_Factor-1] = borrowRate;

            uint256 supplyRate = ir.getSupplyRate(cash, borrow, reserves, reserveFactorMantissa);
            supplySimulation[percent_Factor-1] = supplyRate;
        }

        return SimulationResponse({
            borrowSimulation: borrowSimulation,
            supplySimulation: supplySimulation
        });
    }
 
}