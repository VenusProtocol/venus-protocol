pragma solidity 0.8.13;

interface IVToken {
    function mintBehalf(address receiver, uint mintAmount) external returns (uint);

    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);

    function borrowBalanceCurrent(address account) external returns (uint);
}
