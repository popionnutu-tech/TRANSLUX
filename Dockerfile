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

# ffmpeg pentru clipurile bloggerilor (Ion, 10.10.2026: «ce va fi cu fișierele de 800 MB?»): Instagram Reels primește
# cel mult 300 MB, iar HEVC / 4K se aduc la H.264 1080p (apps/bot/src/social/conversie.ts).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

USER node

CMD ["node", "apps/bot/dist/index.js"]
