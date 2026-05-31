#!/bin/sh
# Apply pending migrations, then start the API (which also serves the SPA when
# WEB_DIST is set). `exec` keeps the server as PID 1 for clean signal handling.
set -e

# Run from the app root so the relative --schema / -w paths resolve regardless
# of the caller's working directory.
cd "$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"

echo "Applying database migrations..."
npx prisma migrate deploy --schema packages/server/prisma/schema.prisma

echo "Starting FlowPlan server..."
exec npm run start -w @flowplan/server
