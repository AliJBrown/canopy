#!/usr/bin/env bash
set -e

SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"
echo "$SCHEDULE /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" | crontab -
echo "[backup] Scheduled: $SCHEDULE"

# Run immediately on first start if requested
if [ "${BACKUP_ON_START:-false}" = "true" ]; then
  echo "[backup] Running initial backup..."
  /usr/local/bin/backup.sh
fi

exec crond -f -l 2
