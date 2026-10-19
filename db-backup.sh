#!/bin/sh
cd /app
exec node_modules/.bin/tsx scripts/db-backup.ts "$@"
