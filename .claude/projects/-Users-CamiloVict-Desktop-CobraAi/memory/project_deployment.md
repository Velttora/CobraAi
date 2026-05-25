---
name: project-deployment
description: Plan de despliegue de CobraAI — fly.io para backend, Vercel para frontend
metadata:
  type: project
---

fly.io apps: `cobrai-api` (gateway público, mia), `cobrai-portfolios`, `cobrai-workflows`, `cobrai-notifications`, `cobrai-payments` (todos internos, PORT=8080).

Vercel: `apps/web` (Next.js 14), con Root Directory = `apps/web` en la consola de Vercel.

Archivos creados:
- `Dockerfile` — monorepo multi-stage con ARG APP_NAME; usa `pnpm --filter "@cobrai/${APP_NAME}..." build`
- `.dockerignore` — excluye node_modules, dist, .env*, .next
- `infra/fly/*.fly.toml` — uno por servicio
- `infra/fly/deploy.sh` — script de despliegue ordenado
- `apps/web/vercel.json` — installCommand y buildCommand para monorepo

**Why:** Arquitectura microservicios con pnpm monorepo. Servicios internos se comunican vía red privada fly.io (`*.internal:8080`). Kafka manejado por Upstash.

**How to apply:** Al trabajar en temas de CI/CD, Docker, o infraestructura, referir a estos archivos. Las migraciones de DB se corren externamente (no hay release_command porque Prisma CLI no está en imagen de producción).
