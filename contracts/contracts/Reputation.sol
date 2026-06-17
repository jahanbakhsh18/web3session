// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title Reputation
 * @notice Stores an immutable, cumulative reputation score for each address.
 *         Only the SessionRegistry may write new ratings.
 *
 *         Score is a weighted average (sum of all ratings / count of ratings). Stored as integer numerator + denominator 
 *         to avoid floating point. Callers compute the decimal average off-chain: score = total / count.
 *
 *         Why not just store the average? Updating a running average requires division on-chain (expensive and lossy). 
 *         Storing (total, count) lets us update with one addition each, and compute the exact average in the frontend with full precision.
 */
contract Reputation {

    // *** State ***

    address public immutable registry;

    struct Score {
        uint256 total;   // sum of all ratings received (1–5 each)
        uint256 count;   // number of ratings received
    }

    mapping(address => Score) private _scores;

    // *** Events ***
    event Recorded(address indexed subject, uint8 score, uint256 newTotal, uint256 newCount);

    // *** Errors ***
    error OnlyRegistry();
    error InvalidScore();

    // *** Constructor ***
    constructor(address registry_) {
        registry = registry_;
    }

    // *** Registry-only interface ***

    /**
     * @notice Records a single rating for an address.
     * @param subject  The address being rated.
     * @param score    Rating from 1 to 5.
     */
    function record(address subject, uint8 score) external {
        if (msg.sender != registry) revert OnlyRegistry();
        if (score < 1 || score > 5) revert InvalidScore();

        _scores[subject].total += score;
        _scores[subject].count += 1;

        emit Recorded(subject, score, _scores[subject].total, _scores[subject].count);
    }

    // *** Views ***

    /**
     * @notice Returns the raw (total, count) so the caller can compute the average.
     * @param subject  The address whose reputation to query.
     * @return total   Sum of all ratings.
     * @return count   Number of ratings.
     */
    function scoreOf(address subject) external view returns (uint256 total, uint256 count) {
        Score storage s = _scores[subject];
        return (s.total, s.count);
    }

    /**
     * @notice Returns the average score scaled by 100 (e.g. 450 = 4.50 stars).
     *         Returns 0 if the address has no ratings yet.
     * @param subject  The address to query.
     */
    function averageScore(address subject) external view returns (uint256) {
        Score storage s = _scores[subject];
        if (s.count == 0) return 0;
        return (s.total * 100) / s.count;   // e.g. 450 = "4.50"
    }
}
