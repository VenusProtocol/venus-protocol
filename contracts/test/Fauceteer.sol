pragma solidity ^0.5.16;

import "../EIP20NonStandardInterface.sol";

/**
  * @title Fauceteer
  * @author Venus
  * @notice First computer program to be part of The Giving Pledge
  */
contract Fauceteer {

    /**
      * @notice Drips some tokens to caller
      * @dev We send 0.01% of our tokens to the caller. Over time, the amount will tend toward and eventually reach zero.
      * @param token The token to drip. Note: if we have no balance in this token, function will revert.
      */
    function drip(EIP20NonStandardInterface token) public {
        uint tokenBalance = token.balanceOf(address(this));
        require(tokenBalance > 0, "Fauceteer is empty");
        token.transfer(msg.sender, tokenBalance / 10000); // 0.01%

        bool success;
        assembly {
            switch returndatasize()
                case 0 {                       // This is a non-standard BEP-20
                    success := not(0)          // set success to true
                }
                case 32 {                      // This is a compliant BEP-20
                    returndatacopy(0, 0, 32)
                    success := mload(0)        // Set `success = returndata` of external call
                }
                default {                      // This is an excessively non-compliant BEP-20, revert.
                    revert(0, 0)
                }
        }

        require(success, "Transfer returned false.");
    }
}
