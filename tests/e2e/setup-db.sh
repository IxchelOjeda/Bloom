#!/usr/bin/env bash
# Creates a fresh e2e database: Supabase stub + all migrations + gateway password table.
set -euo pipefail
cd "$(dirname "$0")/../.."
P="psql -q -v ON_ERROR_STOP=1"
DB=${PGDATABASE:-orchid_e2e}
PGDATABASE=postgres $P -c "drop database if exists $DB with (force)" -c "create database $DB"
$P -d $DB -f tests/db/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do $P -d $DB -f "$f" 2>&1 | grep -v NOTICE || true; done
$P -d $DB -c "create table auth.gw_passwords (user_id uuid primary key references auth.users(id) on delete cascade, hash text not null)"
echo "e2e database $DB ready"
