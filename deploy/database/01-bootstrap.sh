#!/bin/sh
set -eu
read_secret() {
  secret_value=$(cat "$1")
  case "$secret_value" in *[!a-f0-9]*|'') echo 'Invalid bootstrap secret format.' >&2; exit 1;; esac
  [ "${#secret_value}" -eq 64 ] || exit 1
  printf '%s' "$secret_value"
}
migrator_password=$(read_secret /bootstrap/migrator/migrator_password)
api_password=$(read_secret /bootstrap/api/api_password)
worker_password=$(read_secret /bootstrap/worker/worker_password)
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<SQL
REVOKE CREATE,TEMPORARY ON DATABASE tms FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE tms_migrator LOGIN PASSWORD '$migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE tms_api LOGIN PASSWORD '$api_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE tms_worker LOGIN PASSWORD '$worker_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT CONNECT ON DATABASE tms TO tms_migrator,tms_api,tms_worker;
CREATE SCHEMA foundation AUTHORIZATION tms_migrator;
REVOKE ALL ON SCHEMA foundation FROM PUBLIC;
SQL
unset migrator_password api_password worker_password secret_value
