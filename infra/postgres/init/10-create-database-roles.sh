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
  --set=runtime_password="$POSTGRES_RUNTIME_PASSWORD" <<'SQL'
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
SQL
