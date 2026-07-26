#!/bin/sh
set -eu

# PostgreSQL creates POSTGRES_USER as a superuser. Use it only to create the
# separate non-superuser migration owner and runtime roles for a new volume.
psql \
  --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=bootstrap_role="$POSTGRES_USER" \
  --set=owner_role=repurposepro_owner \
  --set=owner_password="$POSTGRES_OWNER_PASSWORD" \
  --set=runtime_role=repurposepro_runtime \
  --set=runtime_password="$POSTGRES_RUNTIME_PASSWORD" \
  --set=checkout_role=repurposepro_checkout \
  --set=checkout_password="$POSTGRES_CHECKOUT_PASSWORD" \
  --set=webhook_role=repurposepro_webhook \
  --set=webhook_password="$POSTGRES_WEBHOOK_PASSWORD" \
  --set=processing_role=repurposepro_processing \
  --set=processing_password="$POSTGRES_PROCESSING_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'owner_role',
  :'owner_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner_role')
\gexec

SELECT format(
  'ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'owner_role',
  :'owner_password'
)
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', current_database(), :'owner_role')
\gexec

SELECT format('ALTER SCHEMA public OWNER TO %I', :'owner_role')
\gexec

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'runtime_role',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role')
\gexec

SELECT format(
  'ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'runtime_role',
  :'runtime_password'
)
\gexec

SELECT format('REVOKE %I FROM %I', :'owner_role', :'runtime_role')
\gexec

SELECT format('REVOKE %I FROM %I', :'bootstrap_role', :'runtime_role')
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'checkout_role',
  :'checkout_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'checkout_role')
\gexec

SELECT format(
  'ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'checkout_role',
  :'checkout_password'
)
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'webhook_role',
  :'webhook_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'webhook_role')
\gexec

SELECT format(
  'ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'webhook_role',
  :'webhook_password'
)
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'processing_role',
  :'processing_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'processing_role')
\gexec

SELECT format(
  'ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'processing_role',
  :'processing_password'
)
\gexec

SELECT format(
  'REVOKE %I, %I FROM %I',
  :'owner_role',
  :'bootstrap_role',
  :'checkout_role'
)
\gexec

SELECT format(
  'REVOKE %I, %I FROM %I',
  :'owner_role',
  :'bootstrap_role',
  :'webhook_role'
)
\gexec

SELECT format(
  'REVOKE %I, %I FROM %I',
  :'owner_role',
  :'bootstrap_role',
  :'processing_role'
)
\gexec
SQL
