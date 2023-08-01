// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IVAI {
    function balanceOf(address usr) external returns (uint256);

    function transferFrom(address src, address dst, uint amount) external returns (bool);

    function mint(address usr, uint wad) external;

    function burn(address usr, uint wad) external;
}
