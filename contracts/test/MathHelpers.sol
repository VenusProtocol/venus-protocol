pragma solidity 0.8.13;

contract MathHelpers {
    /*
     * @dev Creates a number like 15e16 as a uint256 from scientific(15, 16).
     */
    function scientific(uint val, uint expTen) internal pure returns (uint) {
        return val * (10 ** expTen);
    }
}
