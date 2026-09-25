#!/usr/bin/env sh
set -eu

APP_DIR="/opt/ls_itinerary"
BACKUP_DIR="$APP_DIR/backups"
mkdir -p "$BACKUP_DIR"

set -a
. "$APP_DIR/.env"
set +a

STAMP=$(date +%Y%m%d_%H%M%S)
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/logisource_itinerary_${STAMP}.sql.gz"
find "$BACKUP_DIR" -type f -name '*.sql.gz' -mtime +14 -delete
printf 'Backup created: %s/logisource_itinerary_%s.sql.gz\n' "$BACKUP_DIR" "$STAMP"
