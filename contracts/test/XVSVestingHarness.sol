pragma solidity ^0.5.16;

import "../../contracts/VRT/XVSVesting.sol";

contract XVSVestingHarness is XVSVesting {

   address public constant ZERO_ADDRESS = 0x0000000000000000000000000000000000000000;

   constructor() XVSVesting() public {
      admin = msg.sender;
   }

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

   function getVestingCount(address beneficiary) view public returns(uint256) {
      return vestings[beneficiary].length;
   }

   function getVestedAmount(address recipient) view public nonZeroAddress(recipient) returns (uint256) {

      VestingRecord[] memory vestingsOfRecipient = vestings[recipient];
      uint256 vestingCount = vestingsOfRecipient.length;
      uint256 totalVestedAmount = 0;
      uint256 currentTime = getCurrentTime();

      for(uint i = 0; i < vestingCount; i++) {
         VestingRecord memory vesting = vestingsOfRecipient[i];
         uint256 vestedAmount = calculateVestedAmount(vesting.amount, vesting.startTime, currentTime);
         totalVestedAmount = totalVestedAmount.add(vestedAmount);
      }

      return totalVestedAmount;
   }

}