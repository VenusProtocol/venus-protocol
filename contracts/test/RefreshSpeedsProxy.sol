// SPDX-FileCopyrightText: 2021 Venus Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

pragma solidity ^0.5.16;

interface IComptroller {
	function refreshVenusSpeeds() external;
}

contract RefreshSpeedsProxy {
	constructor(address comptroller) public {
		IComptroller(comptroller).refreshVenusSpeeds();
	}
}
