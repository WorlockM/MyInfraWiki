# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
ARG APP_VERSION=dev
ARG APP_COMMIT=unknown
ENV VITE_APP_VERSION=$APP_VERSION
ENV VITE_APP_COMMIT=$APP_COMMIT
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
# Build tools needed for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine
WORKDIR /app

# su-exec lets the entrypoint drop from root to the node user after fixing
# /data ownership on volumes created by older (root-running) images
RUN apk add --no-cache su-exec

# Install build tools, install production deps, then remove tools — all in one
# layer so intermediate files don't bloat the final image
COPY backend/package*.json ./
RUN apk add --no-cache python3 make g++ \
  && npm install --omit=dev \
  && apk del python3 make g++

# Copy backend build output
COPY --from=backend-build /app/backend/dist ./dist

# Copy frontend build output (served by backend in production)
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directories, owned by the unprivileged node user
RUN mkdir -p /data/uploads && chown -R node:node /data

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/wiki.db
ENV UPLOADS_PATH=/data/uploads
ENV PORT=3000

EXPOSE 3000

# The entrypoint starts as root, ensures /data is owned by the node user
# (also migrating volumes from older root-running images), then drops
# privileges via su-exec before starting the app.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
