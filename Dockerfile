# FlowPlan — single image serving the SPA + API on one origin.
# Multi-stage: install workspaces, build the SPA, run the server under tsx.
# Base: Debian slim (reliable Prisma engines + argon2 prebuilds).

# ---- deps: workspace install (dev deps included; tsx + prisma CLI run at runtime) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci

# ---- build: compile the SPA and generate the Prisma client ----
FROM deps AS build
COPY . .
RUN npm run build -w @flowplan/web \
  && npx prisma generate --schema packages/server/prisma/schema.prisma

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    WEB_DIST=/app/packages/web/dist

# Dependencies (incl. the generated Prisma client) and the runnable source.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/src ./packages/core/src
COPY --from=build /app/packages/server/package.json ./packages/server/package.json
COPY --from=build /app/packages/server/tsconfig.json ./packages/server/tsconfig.json
COPY --from=build /app/packages/server/src ./packages/server/src
COPY --from=build /app/packages/server/prisma ./packages/server/prisma
COPY --from=build /app/packages/server/docker-entrypoint.sh ./packages/server/docker-entrypoint.sh
# web manifest (so `npm run -w` workspace resolution is happy) + the built SPA.
COPY --from=build /app/packages/web/package.json ./packages/web/package.json
COPY --from=build /app/packages/web/dist ./packages/web/dist
RUN chmod +x packages/server/docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["packages/server/docker-entrypoint.sh"]
