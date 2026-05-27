# ─── Base ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache openssl libc6-compat python3 make g++ \
  && corepack enable && corepack prepare pnpm@11.1.2 --activate

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

ARG APP_NAME
# Prisma client for Alpine (linux-musl) — generated once in the monorepo store
RUN pnpm --filter @cobrai/db run db:generate

# Build the target app and all its workspace dependencies in topological order
RUN pnpm --filter "@cobrai/${APP_NAME}..." run build

# Production bundle with resolved node_modules (pnpm symlinks)
RUN pnpm --filter "@cobrai/${APP_NAME}" deploy --prod --legacy /deploy

# pnpm deploy isolates deps; copy generated Prisma engine into the deploy store
RUN PRISMA_CLIENT_PATH="$(find /app/node_modules/.pnpm -path '*/@prisma+client@*/node_modules/.prisma/client' -type d | head -1)" \
  && test -n "$PRISMA_CLIENT_PATH" \
  && find /deploy/node_modules/.pnpm -path '*/@prisma+client@*/node_modules/.prisma' -type d | while read -r dest; do \
       mkdir -p "$dest" && rm -rf "$dest/client" && cp -a "$PRISMA_CLIENT_PATH" "$dest/client"; \
     done \
  && rm -f /deploy/.env /deploy/.env.*

# ─── Runner ──────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /deploy /app

CMD ["node", "dist/main.js"]
