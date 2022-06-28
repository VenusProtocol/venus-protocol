pragma solidity ^0.5.16;

import "../ComptrollerG2.sol";

contract ComptrollerScenarioG2 is ComptrollerG2 {
    uint public blockNumber;
    /// @notice Supply caps enforced by mintAllowed for each vToken address. Defaults to zero which corresponds to minting notAllowed
    mapping(address => uint) public supplyCaps;

    constructor() ComptrollerG2() public {}

    function fastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function membershipLength(VToken vToken) public view returns (uint) {
        return accountAssets[address(vToken)].length;
    }

    function unlist(VToken vToken) public {
        markets[address(vToken)].isListed = false;
    }

    function setVenusSpeed(address vToken, uint venusSpeed) public {
        venusSpeeds[vToken] = venusSpeed;
    }

    /**
    * @notice Set the given supply caps for the given vToken markets. Supply that brings total Supply to or above supply cap will revert.
    * @dev Admin function to set the supply caps. A supply cap of 0 corresponds to Minting NotAllowed.
    * @param vTokens The addresses of the markets (tokens) to change the supply caps for
    * @param newSupplyCaps The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed.
    */
    function _setMarketSupplyCaps(VToken[] calldata vTokens, uint[] calldata newSupplyCaps) external {
        require(msg.sender == admin , "only admin can set supply caps");

        uint numMarkets = vTokens.length;
        uint numSupplyCaps = newSupplyCaps.length;

        require(numMarkets != 0 && numMarkets == numSupplyCaps, "invalid input");

        for(uint i = 0; i < numMarkets; i++) {
            supplyCaps[address(vTokens[i])] = newSupplyCaps[i];
        }
    }
}
