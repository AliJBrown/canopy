#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DB_DIR="$BACKUP_DIR/db"
FILES_DIR="$BACKUP_DIR/files"

mkdir -p "$DB_DIR" "$FILES_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== Canopy backup starting ==="

# ── PostgreSQL ──────────────────────────────────────────────────────────────
log "Dumping database..."
DB_FILE="$DB_DIR/canopy_${TIMESTAMP}.sql.gz"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "${POSTGRES_HOST:-db}" \
  -U "$POSTGRES_USER" \
  "$POSTGRES_DB" | gzip > "$DB_FILE"
log "DB saved: $DB_FILE ($(du -sh "$DB_FILE" | cut -f1))"

# ── MinIO files ─────────────────────────────────────────────────────────────
log "Syncing MinIO bucket..."
mc alias set canopy "http://${MINIO_ENDPOINT:-minio}:${MINIO_PORT:-9000}" \
  "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" --quiet 2>/dev/null
mc mirror --overwrite --quiet canopy/"$MINIO_BUCKET" "$FILES_DIR/"
log "Files synced to $FILES_DIR"

# ── Retention cleanup ────────────────────────────────────────────────────────
log "Removing DB dumps older than ${RETENTION_DAYS} days..."
find "$DB_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

# ── Optional: sync to external store via rclone ──────────────────────────────
# Set BACKUP_RCLONE_DEST in .env to enable, e.g.:
#   BACKUP_RCLONE_DEST=s3:my-bucket/canopy-backups
#   BACKUP_RCLONE_DEST=b2:my-bucket/canopy-backups
# Place an rclone.conf in ./config/rclone.conf on the host, or use
# RCLONE_CONFIG_* env vars (see rclone docs for env-based config).
if [ -n "${BACKUP_RCLONE_DEST:-}" ]; then
  log "Syncing to external store: $BACKUP_RCLONE_DEST"
  RCLONE_ARGS="--transfers 4 --log-level INFO"
  if [ -f "/config/rclone.conf" ]; then
    RCLONE_ARGS="$RCLONE_ARGS --config /config/rclone.conf"
  fi
  # shellcheck disable=SC2086
  rclone sync "$BACKUP_DIR" "$BACKUP_RCLONE_DEST" $RCLONE_ARGS
  log "External sync complete"
fi

log "=== Backup complete ==="
