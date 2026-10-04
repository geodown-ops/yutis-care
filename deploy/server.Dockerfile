# The back-end image: tenant API, worker, release job and platform API, picked by the Cloud Run command.
#   node apps/api/dist/main.js            tenant API
#   node apps/api/dist/worker/main.js     worker
#   sh deploy/release.sh                  release job (migrations, login roles, job queues, templates, demo data)
#   node apps/platform-api/dist/main.js   platform API
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@yutis/api..." --filter "@yutis/platform-api..." build

FROM node:22-bookworm-slim
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/platform-api/package.json apps/platform-api/
RUN pnpm install --prod --frozen-lockfile --filter "@yutis/api..." --filter "@yutis/platform-api..." && pnpm store prune
COPY --from=build /src/packages/domain/dist packages/domain/dist
COPY --from=build /src/packages/db/dist packages/db/dist
COPY --from=build /src/packages/db/migrations packages/db/migrations
COPY --from=build /src/apps/api/dist apps/api/dist
COPY --from=build /src/apps/platform-api/dist apps/platform-api/dist
# The release job: deploy/release.sh, and the prototype whose fictional data the demo site loads.
COPY deploy/release.sh deploy/release.sh
COPY prototype prototype
USER node
CMD ["node", "apps/api/dist/main.js"]
