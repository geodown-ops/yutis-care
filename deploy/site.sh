#!/bin/sh
# Run by the nginx image at start (/docker-entrypoint.d). With SITE_HOST set (production: the bare domain,
# care.yutis.net), nginx also serves the marketing site from /srv/site on that host; every other host still gets the
# back offices (nginx.conf, the default server). On Google Cloud the load balancer sends the site's
# /platform-api/public/* (the trial application form and the payment page) to the platform API, so nothing else is needed here.
set -eu
[ -z "${SITE_HOST:-}" ] && exit 0
case "$SITE_HOST" in *[!a-z0-9.-]*) echo "SITE_HOST must be a host name" >&2; exit 1 ;; esac

cat > /etc/nginx/conf.d/site.conf <<CONF
server {
  listen 8080;
  server_name ${SITE_HOST};
  server_tokens off;
  root /srv/site;
  absolute_redirect off;
  error_page 404 /404.html;

  location = /healthz { access_log off; return 204; }

  location /assets/ {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files \$uri =404;
  }

  # The payment page loads TapPay's card fields, so it gets its own policy (payment-headers.conf).
  location /pay/ {
    include /etc/nginx/snippets/payment-headers.conf;
    add_header Cache-Control no-cache always;
    try_files \$uri \$uri/index.html =404;
  }

  # Pages are directories (/trial/ → /trial/index.html); /trial works without the slash too.
  location / {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control no-cache always;
    try_files \$uri \$uri/index.html \$uri.html =404;
  }
}
CONF
