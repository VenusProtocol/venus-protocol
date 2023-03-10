pragma solidity 0.8.13;

import "../Tokens/EIP20Interface.sol";

abstract contract TetherInterface is EIP20Interface {
    function setParams(uint newBasisPoints, uint newMaxFee) external virtual;
}
