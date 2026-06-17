// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Escrow.sol";
import "./Reputation.sol";

/**
 * @title SessionRegistry
 * @notice Core contract for websession. Manages the five-state consultation
 *         session lifecycle: Open → Escrowed → Active → Completed / Disputed.
 *         Delegates fund custody to Escrow.sol and reputation writes to Reputation.sol.
 *
 * State machine:
 *
 *   [Open] --deposit()-->  [Escrowed] --confirm()-->  [Active]
 *                               |                        |
 *                           timeout                complete() / dispute()
 *                               |                   /            \
 *                          [Refunded]        [Completed]       [Disputed]
 */
contract SessionRegistry {

    // *** Types ***

    enum Status {
        Open,       // created, no funds locked
        Escrowed,   // caller deposited ETH; waiting for callee to confirm
        Active,     // callee confirmed; session is live
        Completed,  // session ended cleanly; funds released to callee
        Disputed,   // a party raised a dispute; awaiting arbitration
        Refunded    // callee never confirmed; ETH returned to caller
    }

    struct Session {
        uint256 id;
        address caller;         // the party who books and pays
        address callee;         // the consultant being booked
        uint256 deposit;        // ETH locked in Escrow (wei)
        uint256 durationSecs;   // agreed session length in seconds
        uint256 createdAt;      // block.timestamp at creation
        uint256 confirmedAt;    // block.timestamp when callee confirmed (0 if not yet)
        uint256 confirmTimeout; // seconds callee has to confirm before refund unlocks
        Status  status;
        uint8   callerRating;   // 1-5 star rating given by caller after completion (0 = not rated)
        uint8   calleeRating;   // 1-5 star rating given by callee after completion (0 = not rated)
    }

    // *** States ***

    uint256 public nextSessionId;
    mapping(uint256 => Session) public sessions;

    // All sessions involving an address (as caller or callee)
    mapping(address => uint256[]) private _sessionsByParty;

    Escrow     public immutable escrow;
    Reputation public immutable reputation;

    /// @notice Address that can resolve disputes. In production this would be a multisig or a DAO; for the demo the deployer is arbitrator.
    address public arbitrator;

    // *** Events ***
    event SessionCreated(
        uint256 indexed sessionId, address indexed caller, address indexed callee,
        uint256 deposit, uint256 durationSecs, uint256 confirmTimeout
    );
    event SessionConfirmed(uint256 indexed sessionId, address indexed callee);
    event SessionCompleted(uint256 indexed sessionId, address indexed completedBy);
    event SessionDisputed(uint256 indexed sessionId, address indexed disputedBy);
    event SessionRefunded(uint256 indexed sessionId, address indexed caller, uint256 amount);
    event SessionRated(uint256 indexed sessionId, address indexed rater, uint8 score);
    event DisputeResolved(uint256 indexed sessionId, address indexed winner, uint256 amount);

    // *** Errors ***
    error NotCaller();
    error NotCallee();
    error NotParty();
    error NotArbitrator();
    error WrongStatus(Status current, Status required);
    error ConfirmTimeoutNotExpired();
    error ConfirmTimeoutExpired();
    error InvalidRating();
    error AlreadyRated();
    error ZeroDeposit();
    error InvalidDuration();
    error SelfSession();

    // *** Constructor ***
    constructor(address escrow_, address reputation_, address arbitrator_) {
        escrow     = Escrow(payable(escrow_));
        reputation = Reputation(reputation_);
        arbitrator = arbitrator_;
    }

    // *** Modifier ***
    modifier onlyStatus(uint256 sessionId, Status required) {
        Status current = sessions[sessionId].status;
        if (current != required) revert WrongStatus(current, required);
        _;
    }

    // *** Core flow ***

    /**
     * @notice Caller creates a session and locks ETH into escrow.
     * @param callee_          Address of the consultant being booked.
     * @param durationSecs_    Agreed session length in seconds (e.g. 1800 = 30 min).
     * @param confirmTimeout_  Seconds the callee has to confirm (e.g. 86400 = 24 h).
     * @return sessionId       The new session's ID.
     */
    function createSession(
        address callee_, uint256 durationSecs_, uint256 confirmTimeout_
    ) external payable returns (uint256 sessionId) 
    {
        if (msg.value == 0)         revert ZeroDeposit();
        if (durationSecs_ == 0)     revert InvalidDuration();
        if (msg.sender == callee_)  revert SelfSession();

        sessionId = nextSessionId++;

        sessions[sessionId] = Session({
            id:             sessionId,
            caller:         msg.sender,
            callee:         callee_,
            deposit:        msg.value,
            durationSecs:   durationSecs_,
            createdAt:      block.timestamp,
            confirmedAt:    0,
            confirmTimeout: confirmTimeout_,
            status:         Status.Escrowed,
            callerRating:   0,
            calleeRating:   0
        });

        _sessionsByParty[msg.sender].push(sessionId);
        _sessionsByParty[callee_].push(sessionId);

        // Forward ETH to Escrow; it holds funds until release or refund
        escrow.deposit{value: msg.value}(sessionId, msg.sender);

        emit SessionCreated(sessionId, msg.sender, callee_, msg.value, durationSecs_, confirmTimeout_);
    }

    /**
     * @notice Callee confirms they will show up. Transitions to Active.
     * @param sessionId  The session to confirm.
     */
    function confirmSession(uint256 sessionId) 
        external onlyStatus(sessionId, Status.Escrowed)
    {
        Session storage s = sessions[sessionId];
        if (msg.sender != s.callee) revert NotCallee();

        // Confirm timeout must not have passed yet
        if (block.timestamp > s.createdAt + s.confirmTimeout) {
            revert ConfirmTimeoutExpired();
        }

        s.status      = Status.Active;
        s.confirmedAt = block.timestamp;

        emit SessionConfirmed(sessionId, msg.sender);
    }

    /**
     * @notice Either party ends the session cleanly. Releases escrow to callee.
     * @param sessionId  The session to complete.
     */
    function completeSession(uint256 sessionId)
        external onlyStatus(sessionId, Status.Active)
    {
        Session storage s = sessions[sessionId];
        if (msg.sender != s.caller && msg.sender != s.callee) revert NotParty();

        s.status = Status.Completed;

        escrow.release(sessionId, s.callee, s.deposit);

        emit SessionCompleted(sessionId, msg.sender);
    }

    /**
     * @notice Either party raises a dispute. Freezes the escrow.
     *         The arbitrator resolves via resolveDispute().
     * @param sessionId  The session to dispute.
     */
    function disputeSession(uint256 sessionId)
        external onlyStatus(sessionId, Status.Active)
    {
        Session storage s = sessions[sessionId];
        if (msg.sender != s.caller && msg.sender != s.callee) revert NotParty();

        s.status = Status.Disputed;

        emit SessionDisputed(sessionId, msg.sender);
    }

    /**
     * @notice Caller claims a refund if the callee never confirmed in time.
     * @param sessionId  The session to refund.
     */
    function claimRefund(uint256 sessionId)
        external onlyStatus(sessionId, Status.Escrowed)
    {
        Session storage s = sessions[sessionId];
        if (msg.sender != s.caller) revert NotCaller();

        if (block.timestamp <= s.createdAt + s.confirmTimeout) {
            revert ConfirmTimeoutNotExpired();
        }

        s.status = Status.Refunded;

        escrow.refund(sessionId, s.caller, s.deposit);

        emit SessionRefunded(sessionId, s.caller, s.deposit);
    }

    /**
     * @notice Arbitrator resolves a dispute by choosing a winner.
     * @param sessionId  The disputed session.
     * @param winner     Either the caller (refund) or callee (release) address.
     */
    function resolveDispute(uint256 sessionId, address winner)
        external onlyStatus(sessionId, Status.Disputed)
    {
        if (msg.sender != arbitrator) revert NotArbitrator();

        Session storage s = sessions[sessionId];
        if (winner != s.caller && winner != s.callee) revert NotParty();

        s.status = Status.Completed;

        escrow.release(sessionId, winner, s.deposit);

        emit DisputeResolved(sessionId, winner, s.deposit);
    }

    // *** Reputation ***

    /**
     * @notice Rate the other party after a completed session (1–5 stars).
     *         Each party can rate exactly once; ratings are permanent.
     * @param sessionId  A completed session the caller was part of.
     * @param score      Rating from 1 to 5.
     */
    function rateCounterparty(uint256 sessionId, uint8 score)
        external onlyStatus(sessionId, Status.Completed)
    {
        if (score < 1 || score > 5) revert InvalidRating();

        Session storage s = sessions[sessionId];
        address subject;

        if (msg.sender == s.caller) {
            if (s.callerRating != 0) revert AlreadyRated();
            s.callerRating = score;
            subject = s.callee;
        } else if (msg.sender == s.callee) {
            if (s.calleeRating != 0) revert AlreadyRated();
            s.calleeRating = score;
            subject = s.caller;
        } else {
            revert NotParty();
        }

        reputation.record(subject, score);

        emit SessionRated(sessionId, msg.sender, score);
    }

    // *** Views ***

    /// @notice Returns all session IDs where address was caller or callee.
    function sessionsByParty(address party) external view returns (uint256[] memory) {
        return _sessionsByParty[party];
    }

    /// @notice Convenience: returns the full Session struct for a given ID.
    function getSession(uint256 sessionId) external view returns (Session memory) {
        return sessions[sessionId];
    }
}
