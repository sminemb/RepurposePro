-- Synthetic credentials for disposable, loopback-only test containers.
CREATE ROLE repurposepro_owner LOGIN PASSWORD 'e2e-owner-only' NOINHERIT;
CREATE ROLE repurposepro_runtime LOGIN PASSWORD 'e2e-runtime-only' NOINHERIT;
CREATE ROLE repurposepro_checkout LOGIN PASSWORD 'e2e-checkout-only' NOINHERIT;
CREATE ROLE repurposepro_webhook LOGIN PASSWORD 'e2e-webhook-only' NOINHERIT;
CREATE ROLE repurposepro_processing LOGIN PASSWORD 'e2e-processing-only' NOINHERIT;
ALTER DATABASE repurposepro_e2e OWNER TO repurposepro_owner;
ALTER SCHEMA public OWNER TO repurposepro_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
