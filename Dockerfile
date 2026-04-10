FROM node:22-slim AS build

WORKDIR /app

# Copy all package files first for caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/db/package.json packages/db/tsconfig.json ./packages/db/
COPY apps/bot/package.json apps/bot/tsconfig.json ./apps/bot/

# Install all workspace dependencies
RUN npm ci

# Copy source code
COPY packages/db/src/ ./packages/db/src/
COPY apps/bot/src/ ./apps/bot/src/

# Build packages
RUN npx tsc --project packages/db/tsconfig.json && \
    npx tsc --project apps/bot/tsconfig.json

# Production stage
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY apps/bot/package.json ./apps/bot/

RUN npm ci --omit=dev

COPY --from=build /app/packages/db/dist/ ./packages/db/dist/
COPY --from=build /app/apps/bot/dist/ ./apps/bot/dist/

ENV NODE_ENV=production

USER node

CMD ["node", "apps/bot/dist/index.js"]
