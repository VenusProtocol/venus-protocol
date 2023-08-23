pragma solidity ^0.5.16;

import "../Tokens/EIP20Interface.sol";

contract TetherInterface is EIP20Interface {
    function setParams(uint newBasisPoints, uint newMaxFee) external;
}
