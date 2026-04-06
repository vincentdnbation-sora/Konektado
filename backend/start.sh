#!/bin/sh
echo "=== Running migrations ==="
npx prisma migrate deploy
MIGRATE_EXIT=$?
echo "=== Migration exited with code: $MIGRATE_EXIT ==="

echo "=== Starting NestJS ==="
exec node dist/main
