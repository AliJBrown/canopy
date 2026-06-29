#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
mkdir -p "$BACKUP_DIR"

# Load .env from repo root if present
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

POSTGRES_USER="${POSTGRES_USER:-ticketing}"
POSTGRES_DB="${POSTGRES_DB:-ticketing}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/canopy_${TIMESTAMP}.sql.gz"

echo "Backing up $POSTGRES_DB to $BACKUP_FILE ..."
docker compose -f "$(cd "$(dirname "$0")/.." && pwd)/docker-compose.yml" \
  exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

echo "Backup complete: $BACKUP_FILE"
