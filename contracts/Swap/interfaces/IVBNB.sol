pragma solidity 0.8.13;

interface IVBNB {
    function repayBorrowBehalf(address borrower) external payable;
}
