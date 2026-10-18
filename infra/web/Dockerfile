# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci
COPY apps/web apps/web
COPY packages packages
RUN npm run build --workspace @familylink/web

FROM nginx:1.27-alpine
COPY infra/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/web/browser /usr/share/nginx/html
EXPOSE 80
