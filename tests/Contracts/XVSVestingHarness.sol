pragma solidity ^0.5.16;

import "../../contracts/VRT/XVSVesting.sol";

contract XVSVestingHarness is XVSVesting {

   constructor(address _xvsAddress) XVSVesting(_xvsAddress) public {}

   function calculateWithdrawal(address recipient) public view returns (uint256)
   {
      VestingRecord storage vesting = vestings[recipient]; 
      return super.calculateWithdrawal(vesting);
   }

   function calculateVestingWithdrawalAmountTuple(address recipient, uint256 redeemAmount) public view returns (uint256, uint256, uint256, uint256, uint256)
   {
      VestingRecord storage vesting = vestings[recipient]; 
      uint256 toWithdraw = super.calculateWithdrawal(vesting);
      uint256 remainingAmount = (vesting.totalVestedAmount.sub(vesting.withdrawnAmount)).sub(toWithdraw);
      uint256 totalVestedAmount = vesting.totalVestedAmount;
      uint256 xvsBalance = xvs.balanceOf(address(this));
      return (toWithdraw, vesting.withdrawnAmount, remainingAmount, totalVestedAmount, xvsBalance);
   }

}