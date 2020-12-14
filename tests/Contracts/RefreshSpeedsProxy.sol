pragma solidity 0.5.17;

interface IComptroller {
	function refreshVenusSpeeds() external;
}

contract RefreshSpeedsProxy {
	constructor(address comptroller) public {
		IComptroller(comptroller).refreshVenusSpeeds();
	}
}
