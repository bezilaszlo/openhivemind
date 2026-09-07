# syntax=docker/dockerfile:1
FROM node:24.20.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@11.25.0
WORKDIR /app

# Dependencies only: this layer is reused until the lockfile or a manifest changes.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY client/package.json client/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

# Local development target; compose.dev.yml syncs source into it with Compose Watch.
FROM deps AS dev
COPY . .
ENV VITE_HOST=0.0.0.0
EXPOSE 3000 4483
CMD ["pnpm", "dev"]

FROM deps AS build
COPY . .
# Only the two packages the runtime ships. `deploy` carries backend's dist and
# migrations across on its own; copying them again nested a duplicate in the image.
RUN pnpm --filter @openhivemind/backend --filter @openhivemind/frontend build \
 && pnpm --filter @openhivemind/backend deploy --prod --legacy /out/backend

# Runtime: backend bundle, its production dependencies, migrations and the built viewer.
FROM node:24.20.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/backend ./backend
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist
# A fresh named volume inherits the ownership of the directory it covers, and an
# absent one is created as root; either way node could not write its auth secret.
RUN install -d -o node -g node -m 700 /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "-c", "node backend/dist/server.js migrate && exec node backend/dist/server.js"]
