#!/bin/sh
# Run by the nginx image at start (/docker-entrypoint.d). On Google Cloud the load balancer sends /api and
# /platform-api to the APIs, so nothing is added. Where there is no such load balancer (Railway), API_UPSTREAM and
# PLATFORM_API_UPSTREAM (host:port on the private network, e.g. api.railway.internal:3000) make nginx forward them:
# /api on tenant hosts, /platform-api on the platform host only, as the load balancer does, with Cloud Armor's per-IP
# limits (sign-in and sign links 30 a minute, everything else 1200 a minute).
set -eu
out=/etc/nginx/snippets/api-proxy.conf
: > "$out"
[ -z "${API_UPSTREAM:-}${PLATFORM_API_UPSTREAM:-}" ] && exit 0

cat > /etc/nginx/conf.d/00-api-limits.conf <<'CONF'
limit_req_zone $http_x_real_ip zone=api_sign_in:10m rate=30r/m;
limit_req_zone $http_x_real_ip zone=api_all:10m rate=20r/s;
limit_req_status 429;
CONF

# The APIs (TRUST_PROXY=true) take the client IP from X-Forwarded-For, so send only the address Railway's edge put in
# X-Real-IP, never what the client claimed. Resolve upstream names at request time (they may not resolve yet when nginx starts); IPv6 servers need brackets.
resolvers=$(awk '/^nameserver/ { print ($2 ~ /:/) ? "[" $2 "]" : $2 }' /etc/resolv.conf | tr '\n' ' ')
cat >> "$out" <<CONF
resolver $resolvers valid=10s ipv6=on;
client_max_body_size 12m;
proxy_http_version 1.1;
proxy_set_header Host \$host;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Forwarded-For \$http_x_real_ip;
CONF

if [ -n "${API_UPSTREAM:-}" ]; then
  cat >> "$out" <<CONF
location /api {
  if (\$site_root = /srv/platform) { return 404; }
  limit_req zone=api_all burst=200 nodelay;
  set \$api_upstream http://${API_UPSTREAM};
  proxy_pass \$api_upstream;
}
location ~ ^/api/(auth|sign)/ {
  if (\$site_root = /srv/platform) { return 404; }
  limit_req zone=api_sign_in burst=10 nodelay;
  set \$api_upstream http://${API_UPSTREAM};
  proxy_pass \$api_upstream;
}
CONF
fi

if [ -n "${PLATFORM_API_UPSTREAM:-}" ]; then
  cat >> "$out" <<CONF
location /platform-api {
  if (\$site_root != /srv/platform) { return 404; }
  limit_req zone=api_all burst=200 nodelay;
  set \$platform_api_upstream http://${PLATFORM_API_UPSTREAM};
  proxy_pass \$platform_api_upstream;
}
CONF
fi
