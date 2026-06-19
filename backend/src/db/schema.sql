-- web3session backend schema
-- This database is a READ-OPTIMIZED MIRROR of on-chain state, not a source of truth.
-- The chain is always authoritative. This schema exists so the frontend can query
-- "all sessions for address X" without re-scanning the chain on every page load.

CREATE TABLE IF NOT EXISTS users (
    address       TEXT PRIMARY KEY,         -- lowercase 0x-prefixed Ethereum address
    display_name  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mirrors SessionRegistry.Session struct + status transitions. session_id is the on-chain uint256, stored as TEXT to avoid precision loss
-- (Postgres bigint maxes at 2^63-1; session IDs are small in practice but TEXT is safer and avoids ever having to think about it again).
CREATE TABLE IF NOT EXISTS sessions (
    session_id        TEXT PRIMARY KEY,
    caller_address     TEXT NOT NULL REFERENCES users(address),
    callee_address      TEXT NOT NULL REFERENCES users(address),
    deposit_wei        TEXT NOT NULL,         -- store as string, parse with ethers on read
    duration_secs      INTEGER NOT NULL,
    confirm_timeout    INTEGER NOT NULL,
    status              TEXT NOT NULL DEFAULT 'Open'
                         CHECK (status IN ('Escrowed','Active','Completed','Disputed','Refunded')),
    created_at_chain   TIMESTAMPTZ NOT NULL,  -- block.timestamp of SessionCreated
    confirmed_at_chain TIMESTAMPTZ,
    completed_at_chain TIMESTAMPTZ,
    created_tx_hash    TEXT NOT NULL,
    last_event_tx_hash TEXT,
    last_block_number  BIGINT NOT NULL,
    indexed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_caller ON sessions(caller_address);
CREATE INDEX IF NOT EXISTS idx_sessions_callee ON sessions(callee_address);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Mirrors SessionRated events. One row per rating (caller rates callee, or vice versa).
CREATE TABLE IF NOT EXISTS ratings (
    id            SERIAL PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(session_id),
    rater_address TEXT NOT NULL REFERENCES users(address),
    subject_address TEXT NOT NULL REFERENCES users(address),
    score         SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    tx_hash       TEXT NOT NULL,
    block_number  BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, rater_address)
);

CREATE INDEX IF NOT EXISTS idx_ratings_subject ON ratings(subject_address);

-- Tracks the indexer's progress so restarts resume from the right block
-- instead of re-scanning from genesis or INDEXER_START_BLOCK every time.
CREATE TABLE IF NOT EXISTS indexer_state (
    id                  SMALLINT PRIMARY KEY DEFAULT 1,
    last_processed_block BIGINT NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (id = 1)  -- enforce single row
);
