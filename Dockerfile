# syntax=docker/dockerfile:1

# Quoin, packaged. Four stages so the final image carries no build toolchain:
#
#   toolchain  node + pnpm + python3/make/g++ (better-sqlite3 compiles from source
#              when no prebuilt binary matches the platform)
#   build      every dependency, then `react-router build`
#   prod-deps  production dependencies only, native modules built for the target
#   runtime    node:24-slim + the two above; no compiler, no pnpm, no source tree
#
# Built for linux/amd64 and linux/arm64. Each platform runs its own prod-deps stage,
# so better-sqlite3's binary and Prisma's schema engine always match the image.
#
# The database is never in the image. It lives in the volume at /app/data, and
# .dockerignore keeps data/, *.sqlite, *.csv and .env out of the build context too.

ARG NODE_VERSION=24

# openssl is here and in runtime for Prisma, which picks its schema-engine binary by
# the OpenSSL it finds. Without it, install assumes openssl-1.1.x and downloads the
# wrong engine; `migrate deploy` then tries to fetch the right one into a
# node_modules it cannot write to, and the container never starts.
FROM node:${NODE_VERSION}-slim AS toolchain
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ openssl \
 && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    DATABASE_URL=file:./data/quoin.sqlite
RUN corepack enable
WORKDIR /app
# The root `postinstall` runs `prisma generate`, which reads the config and schema.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma

FROM toolchain AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM toolchain AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:${NODE_VERSION}-slim AS runtime
# tini as PID 1: forwards SIGTERM to node and reaps zombies, so `docker stop`
# shuts the server down instead of waiting out the 10s timeout and killing it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini openssl \
 && rm -rf /var/lib/apt/lists/*

# CHECKPOINT_DISABLE stops the Prisma CLI from phoning home (update check and
# usage telemetry) on every `migrate` the entrypoint runs. A local-first app should
# not make a call nobody asked for each time it starts.
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:./data/quoin.sqlite \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# `migrate deploy` at start, and `db:backup` through `docker exec`. Only the backup
# script is shipped: the other CLI commands have a button in the app.
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts/db-backup.ts ./scripts/
COPY scripts/lib/db-target.ts scripts/lib/backup-names.ts scripts/lib/backup-verify.ts ./scripts/lib/
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/

RUN mkdir -p data && chown node:node data
USER node
VOLUME /app/data
EXPOSE 3000

ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]
CMD ["node_modules/.bin/react-router-serve", "build/server/index.js"]
