-- Rehearse on dev before applying to production. This repository owns only genlexis.
-- doppler run -p genlexis -c dev -- sh -c 'psql "$PRIVATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/006-generation-api-keys.sql'
CREATE TABLE IF NOT EXISTS genlexis.generation_api_keys (
    id text PRIMARY KEY,
    client_name text NOT NULL,
    secret_hash text NOT NULL CONSTRAINT generation_api_keys_secret_hash_unique UNIQUE,
    can_generate boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);
