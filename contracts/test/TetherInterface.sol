pragma solidity 0.8.13;

import "../Tokens/EIP20Interface.sol";

interface TetherInterface is EIP20Interface {
    function setParams(uint newBasisPoints, uint newMaxFee) external;
}
