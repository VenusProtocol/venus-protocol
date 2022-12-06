pragma solidity 0.8.17;

interface ISwapRouter {

	function swapAndSupply(address vTokenAddress ,uint amountIn, uint amountOutMin, address[] calldata path) external;
    function swapBnbAndSupply(address vTokenAddress, uint amountOutMin, address[] calldata path) external payable;
	function swapAndRepay(address vTokenAddress, uint amountIn, uint amountOutMin, address[] calldata path) external;
	function swapBnbAndRepay (address vTokenAddress, uint amountOutMin, address[] calldata path) external payable;

 
}