#!/usr/bin/env bash
set -euo pipefail

echo "=== Mi Banquito — Run All ==="

# Single Next.js app (frontend + serverless API routes in one process).
echo "Starting Next.js on :3000..."
cd apps/web && pnpm dev
