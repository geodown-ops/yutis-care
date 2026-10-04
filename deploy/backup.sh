#!/bin/sh
# pg_dump of the whole database, encrypted with age to BACKUP_AGE_RECIPIENT (the private key stays offline with the
# operator, so the bucket alone can never be read), uploaded to an S3-compatible bucket; exports older than
# BACKUP_KEEP_DAYS (default 35) are deleted. Restore: age -d -i key.txt FILE | pg_restore --clean -d "$DATABASE_URL".
set -eu
set -o pipefail
: "${DATABASE_URL:?}" "${BACKUP_AGE_RECIPIENT:?}" "${BACKUP_BUCKET:?}" "${BACKUP_ENDPOINT:?}"
: "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
keep_days="${BACKUP_KEEP_DAYS:-35}"
prefix="${BACKUP_PREFIX:-yutis-care}"
name="$prefix/$(date -u +%Y%m%dT%H%M%SZ).dump.age"
s3() { aws s3 --endpoint-url "$BACKUP_ENDPOINT" "$@"; }

# Encrypt to a local file first, so a failed dump never leaves a partial export in the bucket.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
pg_dump --format=custom --no-owner "$DATABASE_URL" | age -r "$BACKUP_AGE_RECIPIENT" > "$tmp"
s3 cp "$tmp" "s3://$BACKUP_BUCKET/$name"
echo "[backup] wrote s3://$BACKUP_BUCKET/$name ($(s3 ls "s3://$BACKUP_BUCKET/$name" | awk '{ print $3 }') bytes)"

cutoff=$(date -u -d "@$(( $(date +%s) - keep_days * 86400 ))" +%Y%m%dT%H%M%SZ)
s3 ls "s3://$BACKUP_BUCKET/$prefix/" | awk '{ print $4 }' | while read -r file; do
  stamp="${file%%.dump.age}"
  if [ -n "$stamp" ] && [ "$stamp" \< "$cutoff" ]; then
    s3 rm "s3://$BACKUP_BUCKET/$prefix/$file"
    echo "[backup] deleted $file (older than $keep_days days)"
  fi
done
