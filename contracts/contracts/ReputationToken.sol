// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ReputationToken
 * @notice ERC-20 token minted to both parties when a session completes cleanly.
 *         Not transferable in this demo — it's a proof-of-participation token,
 *         not a currency. Disable transfers to keep the incentive structure clean.
 *
 *         In a production system you might:
 *           - Allow transfers after a vesting period
 *           - Use it for governance (vote on arbitrator slate)
 *           - Gate access to premium features by token balance
 *
 * @dev    Inherits standard ERC-20 from OpenZeppelin. Minting is gated to the registry address only.
 *         _update() override blocks transfers between non-zero addresses.
 */
contract ReputationToken is ERC20 {

    // *** State ***

    address public immutable registry;

    /// @notice Tokens minted per completed session (per party).
    uint256 public constant REWARD_AMOUNT = 10 * 10**18; // 10 RPC tokens

    // *** Event ***
    event Rewarded(uint256 indexed sessionId, address indexed caller, address indexed callee);

    // *** Errors ***
    error OnlyRegistry();
    error TransfersDisabled();

    // *** Constructor ***
    constructor(address registry_) ERC20("web3session Reputation", "W3CR") {
        registry = registry_;
    }

    // *** Registry-only interface ***

    /**
     * @notice Mint reward tokens to both parties of a completed session.
     * @param sessionId  The session ID (emitted for indexing).
     * @param caller_    The session caller address.
     * @param callee_    The session callee address.
     */
    function reward(uint256 sessionId, address caller_, address callee_) external {
        if (msg.sender != registry) revert OnlyRegistry();

        _mint(caller_, REWARD_AMOUNT);
        _mint(callee_, REWARD_AMOUNT);

        emit Rewarded(sessionId, caller_, callee_);
    }

    // *** Transfer restriction ***

    /**
     * @dev Override ERC-20's internal _update hook (OZ v5 pattern).
     *      Block any transfer between two non-zero addresses.
     *      Minting (from == address(0)) and burning (to == address(0)) still work.
     */
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) revert TransfersDisabled();
        super._update(from, to, value);
    }
}
