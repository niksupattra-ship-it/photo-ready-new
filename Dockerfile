FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=optional --no-audit --no-fund

COPY . .
# Deploy builds verify assets and compile only; full regression tests run in CI.
RUN timeout --kill-after=30s 300s env VIPS_CONCURRENCY=2 npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
