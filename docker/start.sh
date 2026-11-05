#!/bin/sh
set -eu
echo "Applying database schema..."
npx prisma migrate deploy
# echo "Seeding accounts and GPU pool..."
# npx tsx scripts/seed.ts
echo "Starting CReMS control plane..."
export HOSTNAME=0.0.0.0
export PORT=3000
export NODE_ENV=production
exec node server.mjs
