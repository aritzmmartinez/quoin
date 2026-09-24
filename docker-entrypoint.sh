#!/bin/sh
# Brings the ledger's schema up to date, then hands the process over to CMD.
#
# `migrate deploy` runs on every start, so a new image migrates the live ledger
# with nobody watching. When migrations are pending and a ledger already exists,
# it is snapshotted first with the same `db:backup` a user would run by hand
# (VACUUM INTO, integrity check, row-count comparison). Only then, and not on
# every start: each backup rotates the 30-file window, so a restart loop would
# push every good snapshot out within minutes.
#
# `migrate status` exits 1 when migrations are pending and 0 when the schema is
# current. A fresh volume has no ledger yet and nothing to protect.
set -eu

LEDGER=/app/data/quoin.sqlite

if [ -f "$LEDGER" ] && ! node_modules/.bin/prisma migrate status >/dev/null 2>&1; then
  echo "quoin: pending migrations, backing up the ledger first"
  npm run --silent db:backup
fi

node_modules/.bin/prisma migrate deploy

exec "$@"
