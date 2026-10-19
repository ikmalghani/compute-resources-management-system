#!/bin/sh
set -eu
echo "Applying database schema..."
npx prisma migrate deploy
echo "Seeding accounts and GPU pool..."
npx tsx scripts/seed.ts
echo "Starting Myspace control plane..."
exec npx next start -H 0.0.0.0 -p 3000
