FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=optional --no-audit --no-fund

COPY . .
# Bound image-processing workers on the Railway builder; runtime is unchanged.
RUN timeout 600s env VIPS_CONCURRENCY=2 npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
