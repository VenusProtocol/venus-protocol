pragma solidity ^0.5.16;

import "../../contracts/VRT/XVSVesting.sol";

contract XVSVestingHarness is XVSVesting {

   address public constant ZERO_ADDRESS = 0x0000000000000000000000000000000000000000;

   constructor(address _xvsAddress, uint256 _xvsPerDay) XVSVesting(_xvsAddress, _xvsPerDay) public {}

   uint public blockNumber;

   function recoverXVS(address recoveryAddress) public payable {
      uint256 xvsBalance = xvs.balanceOf(address(this));
      xvs.safeTransferFrom(address(this), recoveryAddress, xvsBalance);
   }

   function overWriteVRTConversionAddress() public {
      vrtConversionAddress = ZERO_ADDRESS;
   }

   function harnessFastForward(uint blocks) public returns (uint) {
      blockNumber += blocks;
      return blockNumber;
   }

   function setBlockNumber(uint number) public {
      blockNumber = number;
   }

   function getBlockNumber() public view returns (uint) {
      return blockNumber;
   }
}