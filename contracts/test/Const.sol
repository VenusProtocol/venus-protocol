pragma solidity 0.8.13;

contract ConstBase {
    uint public constant C = 1;

    function c() public pure virtual returns (uint) {
        return 1;
    }

    function ADD(uint a) public view virtual returns (uint) {
        // tells compiler to accept view instead of pure
        if (false) {
            C + block.timestamp;
        }
        return a + C;
    }

    function add(uint a) public view returns (uint) {
        // tells compiler to accept view instead of pure
        if (false) {
            C + block.timestamp;
        }
        return a + c();
    }
}

contract ConstSub is ConstBase {
    function c() public pure override returns (uint) {
        return 2;
    }
}
