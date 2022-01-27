pragma solidity ^0.5.16;

import "../../contracts/VRT/XVSVesting.sol";

contract XVSVestingHarness is XVSVesting {

   address public constant ZERO_ADDRESS = 0x0000000000000000000000000000000000000000;

   constructor(address _xvsAddress) XVSVesting(_xvsAddress) public {}

   uint public blockNumber;

   function calculateWithdrawal(address recipient) public view returns (uint256)
   {
      VestingRecord storage vesting = vestings[recipient]; 
      return super.calculateWithdrawal(vesting);
   }

   function recoverXVS(address recoveryAddress) public payable {
      uint256 xvsBalance = xvs.balanceOf(address(this));
      xvs.safeTransferFrom(address(this), recoveryAddress, xvsBalance);
   }

   function overWriteVRTConversionAddress() public {
      vrtConversionAddress = ZERO_ADDRESS;
   }

   function calculateVestingWithdrawalAmountTuple(address recipient) public view returns (uint256, uint256, uint256, uint256, uint256)
   {
      VestingRecord storage vesting = vestings[recipient]; 
      uint256 toWithdraw = super.calculateWithdrawal(vesting);
      uint256 remainingAmount = (vesting.totalVestedAmount.sub(vesting.withdrawnAmount)).sub(toWithdraw);
      uint256 totalVestedAmount = vesting.totalVestedAmount;
      uint256 xvsBalance = xvs.balanceOf(address(this));
      return (toWithdraw, vesting.withdrawnAmount, remainingAmount, totalVestedAmount, xvsBalance);
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