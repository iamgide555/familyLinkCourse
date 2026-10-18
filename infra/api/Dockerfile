# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci
COPY apps/api apps/api
COPY packages packages
COPY scripts scripts
RUN npm run db:generate && npm run build --workspace @familylink/api

FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --omit=dev --workspace @familylink/api --include-workspace-root && npm cache clean --force
COPY --from=builder /app/dist/api ./dist/api
RUN mkdir -p /data/uploads /data/state && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/api/apps/api/src/main.js"]
