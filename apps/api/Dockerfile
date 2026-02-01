# Single stage - run with tsx (simpler, works with ESM)
FROM node:20-alpine

WORKDIR /app

# Copy root package files and config
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy workspace packages
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Install dependencies
RUN npm ci

# Create non-root user and data directory with proper permissions
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 api && \
    mkdir -p /app/data && \
    chown -R api:nodejs /app/data && \
    chmod 755 /app/data

USER api

WORKDIR /app/apps/api

EXPOSE 3001

# Run directly with tsx (handles TypeScript + ESM)
CMD ["npx", "tsx", "src/index.ts"]
