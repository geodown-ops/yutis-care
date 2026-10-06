# The front ends on one nginx: tenant back office at /, employee portal at /me/, platform back office on admin.*, and the
# marketing site on SITE_HOST (deploy/site.sh).
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @yutis/web --filter @yutis/portal --filter @yutis/platform-web --filter @yutis/site build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=755 deploy/api-proxy.sh /docker-entrypoint.d/40-api-proxy.sh
COPY --chmod=755 deploy/site.sh /docker-entrypoint.d/41-site.sh
COPY --from=build /src/apps/web/dist /srv/web
COPY --from=build /src/apps/portal/dist /srv/web/me
COPY --from=build /src/apps/platform-web/dist /srv/platform
COPY --from=build /src/apps/site/dist /srv/site
EXPOSE 8080
