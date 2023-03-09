pragma solidity 0.8.13;

interface IComptroller {
    function refreshVenusSpeeds() external;
}

contract RefreshSpeedsProxy {
    constructor(address comptroller) public {
        IComptroller(comptroller).refreshVenusSpeeds();
    }
}
