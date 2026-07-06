#!/usr/bin/env bash
# Canopy restore script
#
# Usage:
#   ./scripts/restore.sh db              # restore database (interactive backup selection)
#   ./scripts/restore.sh files           # restore MinIO file attachments
#   ./scripts/restore.sh all             # restore both
#   ./scripts/restore.sh db --from path/to/dump.sql.gz
#
# DISASTER RECOVERY (fresh server):
#   1. Install Docker + Docker Compose on the new server
#   2. Copy this entire repo directory to the new server
#   3. Copy your .env file to the repo root
#   4. Copy your ./data/backups/ directory to the repo root
#      (or pull from your rclone external store — see BACKUP_RCLONE_DEST in .env.example)
#   5. Run: docker-compose up -d db minio backup
#   6. Run: ./scripts/restore.sh all
#   7. Run: docker-compose up -d
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$REPO_DIR/data/backups"
COMPOSE="docker compose -f $REPO_DIR/docker-compose.yml"

# Load .env
ENV_FILE="$REPO_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

POSTGRES_USER="${POSTGRES_USER:-ticketing}"
POSTGRES_DB="${POSTGRES_DB:-ticketing}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
MINIO_BUCKET="${MINIO_BUCKET:-canopy-attachments}"

MODE="${1:-}"
DB_FILE=""

usage() {
  echo ""
  echo "Usage: $0 [db|files|all] [--from <dump.sql.gz>]"
  echo ""
  echo "  db      Restore PostgreSQL database only"
  echo "  files   Restore MinIO file attachments only"
  echo "  all     Restore both database and files"
  echo ""
  echo "  --from <path>   Use a specific dump file instead of interactive selection"
  echo ""
  exit 1
}

[ -z "$MODE" ] && usage
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) DB_FILE="$2"; shift 2 ;;
    *) usage ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { echo "[$(date '+%H:%M:%S')] $*"; }

confirm() {
  echo ""
  read -rp "  ⚠  $1  —  type 'yes' to confirm: " ans
  echo ""
  [ "$ans" = "yes" ] || { echo "Aborted."; exit 0; }
}

check_running() {
  $COMPOSE ps --services --filter "status=running" 2>/dev/null | grep -q "^$1$"
}

select_db_backup() {
  if [ -n "$DB_FILE" ]; then
    [ -f "$DB_FILE" ] || { echo "Error: file not found: $DB_FILE"; exit 1; }
    return
  fi

  mapfile -t DUMPS < <(ls -t "$BACKUP_DIR/db/"*.sql.gz 2>/dev/null || true)
  if [ ${#DUMPS[@]} -eq 0 ]; then
    echo "No database backups found in $BACKUP_DIR/db/"
    echo "On a fresh server: copy your data/backups/ directory here first."
    exit 1
  fi

  echo ""
  echo "  Available database backups:"
  for i in "${!DUMPS[@]}"; do
    SIZE=$(du -sh "${DUMPS[$i]}" | cut -f1)
    printf "    %2d)  %-42s  %s\n" "$((i+1))" "$(basename "${DUMPS[$i]}")" "($SIZE)"
  done
  echo ""
  read -rp "  Select backup [1]: " CHOICE
  CHOICE="${CHOICE:-1}"
  DB_FILE="${DUMPS[$((CHOICE-1))]}"
  [ -f "$DB_FILE" ] || { echo "Invalid selection."; exit 1; }
}

# ── Restore database ──────────────────────────────────────────────────────────

restore_db() {
  select_db_backup

  confirm "Replace the current database with: $(basename "$DB_FILE")?"

  RESTART_BACKEND=0
  if check_running backend; then
    log "Stopping backend to prevent writes during restore..."
    $COMPOSE stop backend
    RESTART_BACKEND=1
  fi

  log "Dropping and recreating public schema..."
  $COMPOSE exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB" \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null

  log "Restoring from $(basename "$DB_FILE")..."
  gunzip -c "$DB_FILE" | $COMPOSE exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB" > /dev/null

  if [ "$RESTART_BACKEND" = "1" ]; then
    log "Restarting backend..."
    $COMPOSE start backend
  fi

  log "Database restore complete."
}

# ── Restore files ─────────────────────────────────────────────────────────────

restore_files() {
  FILES_DIR="$BACKUP_DIR/files"

  if [ ! -d "$FILES_DIR" ] || [ -z "$(ls -A "$FILES_DIR" 2>/dev/null)" ]; then
    echo "No files backup found at $FILES_DIR"
    echo "On a fresh server: copy your data/backups/ directory here first."
    exit 1
  fi

  FILE_COUNT=$(find "$FILES_DIR" -type f | wc -l | tr -d ' ')
  confirm "Sync $FILE_COUNT files from backup into the '$MINIO_BUCKET' bucket?"

  log "Restoring MinIO files..."
  $COMPOSE exec -T backup sh -c "
    mc alias set canopy http://minio:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD --quiet 2>/dev/null
    mc mirror --overwrite --quiet /backups/files/ canopy/\$MINIO_BUCKET/
  "

  log "Files restore complete."
}

# ── Run ───────────────────────────────────────────────────────────────────────

echo ""
echo "Canopy Restore"
echo "=============="

case "$MODE" in
  db)    restore_db ;;
  files) restore_files ;;
  all)   restore_db; echo ""; restore_files ;;
  *)     usage ;;
esac

echo ""
log "Done."
