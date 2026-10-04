# Nightly database export for deployments without Cloud SQL backups (Railway): a cron service runs deploy/backup.sh.
# pg_dump must be at least the server's major version (Railway's Postgres template is 18).
FROM postgres:18-alpine
RUN apk add --no-cache age aws-cli
COPY --chmod=755 deploy/backup.sh /usr/local/bin/backup.sh
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
