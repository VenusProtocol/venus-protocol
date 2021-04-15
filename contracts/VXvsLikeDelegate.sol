pragma solidity ^0.5.16;

import "./VBep20Delegate.sol";

interface XvsLike {
  function delegate(address delegatee) external;
}

/**
 * @title Venus's VXvsLikeDelegate Contract
 * @notice VTokens which can 'delegate votes' of their underlying BEP-20
 * @author Venus
 */
contract VXvsLikeDelegate is VBep20Delegate {
  /**
   * @notice Construct an empty delegate
   */
  constructor() public VBep20Delegate() {}

  /**
   * @notice Admin call to delegate the votes of the XVS-like underlying
   * @param xvsLikeDelegatee The address to delegate votes to
   */
  function _delegateXvsLikeTo(address xvsLikeDelegatee) external {
    require(msg.sender == admin, "only the admin may set the xvs-like delegate");
    XvsLike(underlying).delegate(xvsLikeDelegatee);
  }
}