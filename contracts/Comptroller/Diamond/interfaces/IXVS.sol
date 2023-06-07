pragma solidity 0.5.16;

interface IXVS {
    function balanceOf(address account) external view returns (uint);

    function transfer(address dst, uint rawAmount) external returns (bool);

    function approve(address spender, uint rawAmount) external returns (bool);
}
