#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./scripts/restore.sh <path/to/backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: file not found: $BACKUP_FILE"
  exit 1
fi

# Load .env from repo root if present
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

POSTGRES_USER="${POSTGRES_USER:-ticketing}"
POSTGRES_DB="${POSTGRES_DB:-ticketing}"
COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.yml"

echo "Restoring $BACKUP_FILE into database '$POSTGRES_DB'."
echo "WARNING: All existing data will be overwritten."
echo "Press Ctrl+C within 5 seconds to cancel..."
sleep 5

# Drop & recreate the database so the restore is clean
docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}\";" postgres
docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U "$POSTGRES_USER" -c "CREATE DATABASE \"${POSTGRES_DB}\";" postgres

gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" \
  exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "Restore complete."
