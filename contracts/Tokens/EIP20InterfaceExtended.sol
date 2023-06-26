pragma solidity ^0.5.16;

import "./EIP20Interface.sol";

contract EIP20InterfaceExtended is EIP20Interface {
    function decimals() public view returns (uint8);
}
