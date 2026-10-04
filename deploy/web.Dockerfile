# The three front ends on one nginx: tenant back office at /, employee portal at /me/, platform back office on admin.*.
# VITE_API=live calls the API; anything else builds the self-contained demo (fictional data, role switcher).
FROM node:22-bookworm-slim AS build
ARG VITE_API=demo
ENV VITE_API=$VITE_API
RUN corepack enable
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @yutis/web --filter @yutis/portal --filter @yutis/platform-web build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=755 deploy/api-proxy.sh /docker-entrypoint.d/40-api-proxy.sh
COPY --from=build /src/apps/web/dist /srv/web
COPY --from=build /src/apps/portal/dist /srv/web/me
COPY --from=build /src/apps/platform-web/dist /srv/platform
EXPOSE 8080
