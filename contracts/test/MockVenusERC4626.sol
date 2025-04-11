// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;
import { VenusERC4626 } from "../ERC4626/VenusERC4626.sol";

contract MockVenusERC4626 is VenusERC4626 {
    uint256 private mockTotalAssets;
    uint256 private mockMaxDeposit;
    uint256 private mockMaxWithdraw;
    uint256 private mockMaxMint;
    uint256 private mockMaxRedeem;

    // Mock functions for testing
    function setTotalAssets(uint256 _totalAssets) external {
        mockTotalAssets = _totalAssets;
    }

    function setMaxWithdraw(uint256 _maxWithdraw) external {
        mockMaxWithdraw = _maxWithdraw;
    }

    function setMaxDeposit(uint256 _maxDeposit) external {
        mockMaxDeposit = _maxDeposit;
    }

    function setMaxRedeem(uint256 _maxRedeem) external {
        mockMaxRedeem = _maxRedeem;
    }

    function setMaxMint(uint256 _maxMint) external {
        mockMaxMint = _maxMint;
    }

    function getDecimalsOffset() external view returns (uint8) {
        return _decimalsOffset();
    }

    function totalAssets() public view override returns (uint256) {
        return mockTotalAssets;
    }

    function maxDeposit(address) public view override returns (uint256) {
        return mockMaxDeposit;
    }

    function maxWithdraw(address) public view override returns (uint256) {
        return mockMaxWithdraw;
    }

    function maxMint(address) public view override returns (uint256) {
        return mockMaxMint;
    }

    function maxRedeem(address) public view override returns (uint256) {
        return mockMaxRedeem;
    }
}
