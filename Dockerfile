FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY vite.config.web.ts ./
COPY src/ ./src/
RUN npx tsc
RUN npx vite build --config vite.config.web.ts

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap iputils-ping curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY package.json ./
VOLUME /data
ENV NODE_ENV=production
ENV STORAGE_DB_PATH=/data/network-obs.db
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:8080/api/v1/health || exit 1
CMD ["node", "dist/src/api/index.js"]
