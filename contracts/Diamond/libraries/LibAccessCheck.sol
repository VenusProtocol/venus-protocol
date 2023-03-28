pragma solidity 0.8.13;

import "../../Governance/V0.8.13/IAccessControlManager.sol";
import "../../Tokens/V0.8.13/VTokens/VToken.sol";
import "../libraries/appStorage.sol";

library LibAccessCheck {
    enum Action {
        MINT,
        REDEEM,
        BORROW,
        REPAY,
        SEIZE,
        LIQUIDATE,
        TRANSFER,
        ENTER_MARKET,
        EXIT_MARKET
    }

    /// @notice Reverts if the protocol is paused
    function checkProtocolPauseState() internal view {
        AppStorage storage s = LibAppStorage.diamondStorage();
        require(!s.protocolPaused, "protocol is paused");
    }

    /// @notice Reverts if a certain action is paused on a market
    function checkActionPauseState(address market, Action action) internal view {
        require(!actionPaused(market, action), "action is paused");
    }

    /// @notice Reverts if the caller is not admin
    function ensureAdmin() internal view {
        AppStorage storage s = LibAppStorage.diamondStorage();
        require(msg.sender == s.admin, "only admin can");
    }

    /// @notice Checks the passed address is nonzero
    function ensureNonzeroAddress(address someone) internal pure {
        require(someone != address(0), "can't be zero address");
    }

    /// @notice Reverts if the market is not listed
    function ensureListed(Market storage market) internal view {
        require(market.isListed, "market not listed");
    }

    /// @notice Reverts if the caller is neither admin nor the passed address
    function ensureAdminOr(address privilegedAddress) internal view {
        AppStorage storage s = LibAppStorage.diamondStorage();
        require(msg.sender == s.admin || msg.sender == privilegedAddress, "access denied");
    }

    function ensureAllowed(string memory functionSig) internal view {
        AppStorage storage s = LibAppStorage.diamondStorage();
        require(IAccessControlManager(s.accessControl).isAllowedToCall(msg.sender, functionSig), "access denied");
    }

    /**
     * @notice Returns whether the given account is entered in the given asset
     * @param account The address of the account to check
     * @param vToken The vToken to check
     * @return True if the account is in the asset, otherwise false.
     */
    function checkMembership(address account, VToken vToken) external view returns (bool) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        return s.markets[address(vToken)].accountMembership[account];
    }

    /**
     * @notice Checks if a certain action is paused on a market
     * @param action Action id
     * @param market vToken address
     */
    function actionPaused(address market, Action action) public view returns (bool) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        return s._actionPaused[market][uint(action)];
    }

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }
}
