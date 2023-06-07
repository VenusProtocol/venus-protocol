pragma solidity 0.5.16;

import "../../../Tokens/VTokens/VToken.sol";

interface IPolicyFacet {
    function mintAllowed(address vToken, address minter, uint mintAmount) external returns (uint);

    function mintVerify(address vToken, address minter, uint mintAmount, uint mintTokens) external;

    function redeemAllowed(address vToken, address redeemer, uint redeemTokens) external returns (uint);

    function redeemVerify(address vToken, address redeemer, uint redeemAmount, uint redeemTokens) external pure;

    function borrowAllowed(address vToken, address borrower, uint borrowAmount) external returns (uint);

    function borrowVerify(address vToken, address borrower, uint borrowAmount) external;

    function repayBorrowAllowed(
        address vToken,
        address payer,
        address borrower,
        uint repayAmount
    ) external returns (uint);

    function repayBorrowVerify(
        address vToken,
        address payer,
        address borrower,
        uint repayAmount,
        uint borrowerIndex
    ) external;

    function liquidateBorrowAllowed(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount
    ) external returns (uint);

    function liquidateBorrowVerify(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount,
        uint seizeTokens
    ) external;

    function seizeAllowed(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) external returns (uint);

    function seizeVerify(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) external;

    function transferAllowed(address vToken, address src, address dst, uint transferTokens) external returns (uint);

    function transferVerify(address vToken, address src, address dst, uint transferTokens) external;

    function getAccountLiquidity(address account) external view returns (uint, uint, uint);

    function _setVenusSpeeds(
        VToken[] calldata vTokens,
        uint[] calldata supplySpeeds,
        uint[] calldata borrowSpeeds
    ) external;
}
