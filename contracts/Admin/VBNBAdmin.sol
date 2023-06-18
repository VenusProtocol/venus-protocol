// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./VBNBAdminStorage.sol";

import "hardhat/console.sol";

contract VBNBAdmin is Ownable2StepUpgradeable, ReentrancyGuardUpgradeable, VBNBAdminStorage {
    using SafeERC20Upgradeable for IWBNB;

    function initialize(VTokenInterface _vBNB, IProtocolShareReserve _protocolShareReserve, IWBNB _WBNB, address _comptroller) external initializer {
        vBNB = _vBNB;
        protocolShareReserve = _protocolShareReserve;
        WBNB = _WBNB;
        comptroller = _comptroller;

        __Ownable2Step_init();
        __ReentrancyGuard_init();
    }

    function reduceReserves(uint reduceAmount) external nonReentrant {
        require(vBNB._reduceReserves(reduceAmount) == 0, "reduceReserves failed");
        _wrapBNB();

        uint256 balance = WBNB.balanceOf(address(this));
        WBNB.safeTransfer(address(protocolShareReserve), balance);
        protocolShareReserve.updateAssetsState(comptroller, address(WBNB), IProtocolShareReserve.IncomeType.SPREAD);
    }

    function acceptVBNBAdmin() external nonReentrant returns (uint) {
        require(msg.sender == owner(), "only owner can accept admin");
        return vBNB._acceptAdmin();
    }

    function _wrapBNB() internal {
        uint256 bnbBalance = address(this).balance;
        WBNB.deposit{ value: bnbBalance }();
    }

    receive() external payable{
        require(msg.sender == address(vBNB), "only vBNB can send BNB to this contract");       
    }

    fallback(bytes calldata data) external payable returns (bytes memory) {
        require(msg.sender == owner(), "only owner can call vBNB admin functions");

        (bool ok, bytes memory res) = address(vBNB).call{value: msg.value}(data);
        require(ok, "call failed");
        return res;
    }
}