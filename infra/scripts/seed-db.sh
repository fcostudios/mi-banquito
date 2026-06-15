#!/usr/bin/env bash
set -euo pipefail

echo "=== Seeding development database ==="
cd packages/db
node scripts/seed-local.mjs
