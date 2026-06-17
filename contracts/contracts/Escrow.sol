// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title Escrow
 * @notice Standalone ETH vault for web3session sessions.
 *         Only the designated registry address may deposit, release, or refund.
 *         Keeping escrow separate from the registry means:
 *           1. Funds are auditable independently of session logic.
 *           2. The registry can be upgraded without touching custody code.
 *           3. Each session's balance is tracked individually.
 *
 * @dev The registry is set once at construction (immutable). If you need
 *      upgradeability, replace immutable with an owner-settable address and
 *      add a timelock. For the demo, immutable is correct.
 */
contract Escrow {

    // *** State ***

    /// @notice The only address that can call deposit / release / refund.
    address public immutable registry;

    /// @notice ETH balance held per session ID.
    mapping(uint256 => uint256) public balances;

    // *** Events ***
    event Deposited(uint256 indexed sessionId, address indexed from,   uint256 amount);
    event Released (uint256 indexed sessionId, address indexed to,     uint256 amount);
    event Refunded (uint256 indexed sessionId, address indexed to,     uint256 amount);

    // *** Errors ***
    error OnlyRegistry();
    error InsufficientBalance(uint256 available, uint256 requested);
    error TransferFailed();
    error AlreadyDeposited();

    // *** Constructor ***
    constructor(address registry_) {
        registry = registry_;
    }

    // *** Registry-only interface ***
    modifier onlyRegistry() {
        if (msg.sender != registry) revert OnlyRegistry();
        _;
    }

    /**
     * @notice Locks ETH for a session. Called by SessionRegistry.createSession().
     * @param sessionId  The session this deposit belongs to.
     * @param from       The caller address (for event clarity only; msg.value is the source).
     */
    function deposit(uint256 sessionId, address from) external payable onlyRegistry {
        if (balances[sessionId] != 0) revert AlreadyDeposited();
        balances[sessionId] = msg.value;
        emit Deposited(sessionId, from, msg.value);
    }

    /**
     * @notice Releases funds to the callee (or dispute winner).
     * @param sessionId  The session whose balance to release.
     * @param to         The recipient address.
     * @param amount     The wei amount to send (must equal the session's balance for now).
     */
    function release(uint256 sessionId, address to, uint256 amount) external onlyRegistry {
        uint256 bal = balances[sessionId];
        if (bal < amount) revert InsufficientBalance(bal, amount);

        balances[sessionId] -= amount;

        (bool ok,) = payable(to).call{value: amount}('');
        if (!ok) revert TransferFailed();

        emit Released(sessionId, to, amount);
    }

    /**
     * @notice Returns funds to the caller on timeout or resolved dispute.
     * @param sessionId  The session whose balance to refund.
     * @param to         The original caller address.
     * @param amount     The wei amount to return.
     */
    function refund(uint256 sessionId, address to, uint256 amount) external onlyRegistry {
        uint256 bal = balances[sessionId];
        if (bal < amount) revert InsufficientBalance(bal, amount);

        balances[sessionId] -= amount;

        (bool ok,) = payable(to).call{value: amount}('');
        if (!ok) revert TransferFailed();

        emit Refunded(sessionId, to, amount);
    }

    // *** Views ***

    /// @notice Returns the ETH balance held for a given session.
    function balanceOf(uint256 sessionId) external view returns (uint256) {
        return balances[sessionId];
    }

    /// @notice Total ETH held across all sessions (should match address balance).
    function totalHeld() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        // Reject direct ETH transfers — all funds must go through deposit()
        revert OnlyRegistry();
    }
}
