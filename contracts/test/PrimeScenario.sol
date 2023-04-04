pragma solidity 0.8.13;

import "../Tokens/Prime/Prime.sol";

contract PrimeScenario is Prime {
    function calculateScore(uint256 xvs, uint256 capital) external view returns (uint256) {
        return Scores.calculateScore(xvs, capital, alphaNumerator, alphaDenominator);
    }
}
