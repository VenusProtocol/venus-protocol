// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017, 2018, 2019 dbrock, rain, mrchico

pragma solidity 0.8.25;

interface IVAI {
    // --- Auth ---
    function wards(address) external view returns (uint256);
    function rely(address guy) external;
    function deny(address guy) external;

    // --- BEP20 Data ---
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function version() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);

    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
    function nonces(address) external view returns (uint256);

    event Approval(address indexed src, address indexed guy, uint256 wad);
    event Transfer(address indexed src, address indexed dst, uint256 wad);

    // --- EIP712 niceties ---
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    // bytes32 public constant PERMIT_TYPEHASH = keccak256("Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)");
    function PERMIT_TYPEHASH() external view returns (bytes32);

    // --- Token ---
    function transfer(address dst, uint256 wad) external returns (bool);
    function transferFrom(address src, address dst, uint256 wad) external returns (bool);
    function mint(address usr, uint256 wad) external;
    function burn(address usr, uint256 wad) external;
    function approve(address usr, uint256 wad) external returns (bool);

    // --- Alias ---
    function push(address usr, uint256 wad) external;
    function pull(address usr, uint256 wad) external;
    function move(address src, address dst, uint256 wad) external;

    // --- Approve by signature ---
    function permit(
        address holder,
        address spender,
        uint256 nonce,
        uint256 expiry,
        bool allowed,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
