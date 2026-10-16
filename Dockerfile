# syntax=docker/dockerfile:1

# Firefly storefront: production image (Next.js standalone output).
#
#   docker build --build-arg FIREFLY_API_URL=https://api.example.ir -t firefly-front .
#   docker run --env-file .env -p 3000:3000 firefly-front
#
# FIREFLY_API_URL is the only build argument: next/image reads its host allow-list at build time.
# Everything else (API key, site URL, theme, features...) is runtime environment, see .env.example
# and docs/DEPLOYMENT.md. Node 22.12 or newer is required (sanitize-html needs require(esm)).

ARG NODE_VERSION=22.23

# ---------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# pnpm in the exact version pinned by "packageManager" in package.json, downloaded once here.
COPY package.json ./
RUN corepack enable pnpm && corepack install

# ---------------------------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# ---------------------------------------------------------------------------------------------
FROM base AS build
# Public origin of the Firefly API, e.g. https://api.example.ir (only its host and port are used).
# Without it the image still builds, but next/image falls back to a permissive allow-list.
ARG FIREFLY_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
# Production mode: the development URL defaults never apply in a container.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The server needs write access to .next/ only (image and data caches); run as the image's
# unprivileged `node` user.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# robots.txt is served by the app and needs the API (it answers 503 when the API is unreachable
# and nothing is cached), so a healthy container is one that can reach the backend too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/robots.txt > /dev/null || exit 1

CMD ["node", "server.js"]
