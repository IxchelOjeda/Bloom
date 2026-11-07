#!/usr/bin/env bash
# Runs the schema + RLS/trigger tests against a local Postgres (no Supabase needed).
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./tests/db/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
P="psql -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists lifeos_test" -c "create database lifeos_test"
$P -d lifeos_test -f tests/db/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do $P -d lifeos_test -f "$f"; done
$P -d lifeos_test -f tests/db/10_rls_and_triggers.sql 2>&1 | grep -E "ok |FAIL|ERROR"
echo "Database tests passed."
