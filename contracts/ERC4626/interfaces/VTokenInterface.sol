pragma solidity ^0.8.25;

import "./ComptrollerInterface.sol";

abstract contract VTokenInterface {
    function mint(uint mintAmount) external virtual returns (uint);

    function redeem(uint redeemTokens) external virtual returns (uint);

    function redeemUnderlying(uint redeemAmount) external virtual returns (uint);

    function balanceOf(address owner) external view virtual returns (uint);

    function comptroller() external view virtual returns (ComptrollerInterface);

    function totalSupply() external view virtual returns (uint);

    function underlying() external view virtual returns (address);

    function getCash() external view virtual returns (uint);

    function exchangeRateStored() public view virtual returns (uint);
}
