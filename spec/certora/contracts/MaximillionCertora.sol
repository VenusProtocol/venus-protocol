pragma solidity ^0.5.16;

import "../../../contracts/Maximillion.sol";

contract MaximillionCertora is Maximillion {
    constructor(VBNB vBnb_) public Maximillion(vBnb_) {}

    function borrowBalance(address account) external returns (uint) {
        return vBnb.borrowBalanceCurrent(account);
    }

    function bnbBalance(address account) external returns (uint) {
        return account.balance;
    }

    function repayBehalf(address borrower) public payable {
        return super.repayBehalf(borrower);
    }
}