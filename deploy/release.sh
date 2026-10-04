#!/bin/sh
# The release job, run before every rollout (and nightly on the demo site, with RESET_DEMO_DATABASE=true):
# migrations, login roles, job queues, platform staff and the demo tenant; then the default templates; then, on the
# demo site only, the prototype's fictional demo data. Stops at the first failure, so nothing rolls out.
set -eu
node apps/api/dist/release.js
node apps/platform-api/dist/sync-templates.js
if [ "${DEMO_SITE:-false}" = "true" ]; then
  node apps/api/dist/seed-prototype.js
fi
