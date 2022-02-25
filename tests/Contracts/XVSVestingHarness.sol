pragma solidity ^0.5.16;

import "../../contracts/VRT/XVSVesting.sol";

contract XVSVestingHarness is XVSVesting {

   address public constant ZERO_ADDRESS = 0x0000000000000000000000000000000000000000;

   constructor(address _xvsAddress) XVSVesting(_xvsAddress) public {}

   uint public blockNumber;

   function recoverXVS(address recoveryAddress) public payable {
      uint256 xvsBalance = xvs.balanceOf(address(this));
      xvs.safeTransferFrom(address(this), recoveryAddress, xvsBalance);
   }

   function overWriteVRTConversionAddress() public {
      vrtConversionAddress = ZERO_ADDRESS;
   }

   function computeWithdrawableAmount(uint256 amount, uint256 vestingStartTime, uint256 withdrawnAmount)
     public view returns (uint256 vestedAmount, uint256 toWithdraw) {
      (vestedAmount, toWithdraw) = super.calculateWithdrawableAmount(amount, vestingStartTime, withdrawnAmount);
      return (vestedAmount, toWithdraw);
   }

   function computeVestedAmount(uint256 vestingAmount, uint256 vestingStartTime, uint256 currentTime)
   public view returns (uint256) {
      return super.calculateVestedAmount(vestingAmount, vestingStartTime, currentTime);
   }


}