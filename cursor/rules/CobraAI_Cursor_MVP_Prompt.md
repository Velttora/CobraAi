# CobraAI — Cursor Prompt para Desarrollo del MVP

> **Alcance de este prompt:** plataforma core completa, sin construir IA, voz ni WhatsApp.
> Esos servicios se desarrollan aparte. Aquí solo creamos los **puertos limpios** (interfaces
> + adaptadores stub) por donde se conectarán cuando estén listos.

> **Cómo usarlo en Cursor:**
> 1. Pega el "Prompt Global" como regla en `.cursor/rules/cobrai.mdc`.
> 2. Pega cada bloque "ETAPA N" en Cursor Agent en orden.
> 3. No avances a la siguiente etapa hasta que los tests de la actual pasen al 100%.

---

# ══════════════════════════════════════════════
# PROMPT GLOBAL — pégalo UNA VEZ al inicio
# Archivo: .cursor/rules/cobrai.mdc
# ══════════════════════════════════════════════

```
Eres el arquitecto principal de CobraAI, una plataforma SaaS para cobranza
y gestión de cuentas por cobrar en América Latina.

ALCANCE DE ESTE TRABAJO
───────────────────────
Construyes el CORE de la plataforma: portafolios, deudas, deudores, pagos,
workflows, dashboard, compliance, audit. NO construyes la IA, ni el agente
de voz, ni la integración con WhatsApp — eso lo hace otro equipo en
paralelo. Tu trabajo es dejar PUERTOS LIMPIOS para que se conecten luego:

- Interface AIScoringPort     → la calcula otro servicio (stub local por ahora)
- Interface VoiceAgentPort    → la implementa otro servicio (stub local)
- Interface WhatsAppPort      → la implementa otro servicio (stub local)
- Interface EmailPort, SMSPort → implementaciones reales SÍ están en alcance

Los stubs locales devuelven datos sintéticos para que el flujo end-to-end
funcione sin esos servicios. Cuando estén listos, solo cambia la
configuración del módulo para inyectar el adaptador real.

STACK TECNOLÓGICO OBLIGATORIO
──────────────────────────────
- Monorepo:    Turborepo + pnpm workspaces
- Frontend:    Next.js 14 (App Router) + React 18 + TypeScript strict
- Backend:     NestJS 10 microservicios + TypeScript strict
- ORM:         Prisma 5 + PostgreSQL 16
- Bus:         Apache Kafka (kafkajs)
- Cache:       Redis 7 (ioredis)
- Auth:        JWT (15min access + 7d refresh) + RBAC
- Estilos:     Tailwind CSS 3 + shadcn/ui
- Tests:       Jest + Supertest (TS) · Playwright (E2E)
- Lint:        ESLint + Prettier
- CI/CD:       GitHub Actions
- Local:       Docker Compose (Postgres, Redis, Kafka, Kafka UI)

REGLAS DE ARQUITECTURA — NUNCA ROMPER
──────────────────────────────────────
1. Ningún servicio accede directamente a la BD de otro servicio.
2. Comunicación asíncrona SIEMPRE por Kafka. HTTP solo para queries.
3. API Gateway es el único punto de entrada externo.
4. Cada servicio tiene su propio schema PostgreSQL.
5. Multi-tenancy: tenant_id SIEMPRE viene del JWT, nunca del body.
6. Row-Level Security activo en TODAS las tablas.
7. Secrets en variables de entorno, NUNCA en código.
8. Endpoints de escritura idempotentes con X-Idempotency-Key.
9. Soft delete: deleted_at TIMESTAMPTZ en todas las tablas.
10. Todo servicio externo va detrás de una INTERFACE (puerto).
    Para los servicios que aún no existen (IA, voz, WhatsApp), implementar
    un StubAdapter que cumpla la interface y devuelva datos sintéticos.

CONVENCIONES DE CÓDIGO
──────────────────────
- TypeScript strict, no `any`, return types explícitos siempre.
- BD: snake_case. Clases: PascalCase. Archivos: kebab-case.
- Respuesta éxito: { success: true, data, meta: { request_id, timestamp } }
- Respuesta error: { success: false, error: { code, message, details } }
- Paginación: ?page=1&limit=25&sort=campo:asc&filter[campo]=valor
- Conventional Commits: feat / fix / chore / docs / test / refactor.

ENVELOPE DE EVENTO KAFKA (estándar)
────────────────────────────────────
{
  event_id, event_type, version, tenant_id, timestamp,
  source, payload, metadata
}

DEFINICIÓN DE LISTO (DoD)
─────────────────────────
✓ Compila sin warnings
✓ Tests unitarios ≥ 80% cobertura
✓ Lint limpio
✓ .env.example actualizado
✓ README del servicio actualizado si cambia su API
✓ Ningún secret en código
✓ Para servicios stub: contrato (interface) documentado y testeado
```

---

# ══════════════════════════════════════════════
# ETAPA 0 — FUNDAMENTOS (semanas 1–3)
# Tiempo estimado en Cursor: 2–4 horas
# ══════════════════════════════════════════════

## 0.1 Scaffolding del monorepo

```
Crea la estructura del monorepo CobraAI con Turborepo y pnpm.

ESTRUCTURA:
cobrai/
├── apps/
│   ├── web/                     # Next.js 14
│   ├── api-gateway/             # NestJS — único punto de entrada
│   ├── service-portfolios/      # NestJS — portafolios y deudas
│   ├── service-workflows/       # NestJS — estrategias y automatización
│   ├── service-notifications/   # NestJS — orquestación omnicanal
│   └── service-payments/        # NestJS — pagos y reconciliación
├── packages/
│   ├── ui/                      # Componentes React compartidos (shadcn base)
│   ├── db/                      # Prisma schema + cliente
│   ├── kafka/                   # Productores/consumidores tipados
│   ├── types/                   # TypeScript types compartidos
│   ├── config/                  # ESLint, TSConfig, Prettier, Jest base
│   ├── utils/                   # Helpers: fechas, moneda, validación LATAM
│   └── ports/                   # ⚠️ INTERFACES de servicios externos
├── infra/
│   └── docker/
│       └── docker-compose.yml   # Postgres, Redis, Kafka, Zookeeper, Kafka UI
├── .github/workflows/ci.yml
├── turbo.json
├── package.json
└── pnpm-workspace.yaml

⚠️ packages/ports — DEFINIR HOY, IMPLEMENTACIÓN REAL DESPUÉS:
Crea estas interfaces que serán los contratos con los servicios externos:

```typescript
// packages/ports/src/ai-scoring.port.ts
export interface AIScoringPort {
  scoreDebt(input: {
    debt_id: string;
    tenant_id: string;
    features: DebtFeatures;
  }): Promise<ScoringResult>;
}
export interface DebtFeatures {
  aging_days: number;
  amount: number;
  amount_outstanding: number;
  has_whatsapp: boolean;
  has_phone: boolean;
  has_email: boolean;
  promises_broken_count: number;
  previous_contacts_count: number;
  industry_sector?: string;
}
export interface ScoringResult {
  score: number;          // 0-100
  segment: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
  risk_level: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
  best_channel: 'whatsapp' | 'voice' | 'email' | 'sms' | 'portal';
  best_contact_time: { days: string[]; hours: string };
  confidence: number;     // 0-1
  model_version: string;
}

// packages/ports/src/voice-agent.port.ts
export interface VoiceAgentPort {
  initiateCall(input: {
    debt_id: string;
    debtor_phone: string;
    strategy_context: StrategyContext;
  }): Promise<{ call_id: string; status: 'queued' | 'failed' }>;
  getCallStatus(call_id: string): Promise<CallStatus>;
}

// packages/ports/src/whatsapp.port.ts
export interface WhatsAppPort {
  sendTemplate(input: {
    to: string;
    template_id: string;
    variables: Record<string, string>;
    tenant_id: string;
  }): Promise<{ message_id: string; status: 'sent' | 'failed' }>;
  isOptedIn(phone: string, tenant_id: string): Promise<boolean>;
}

// packages/ports/src/email.port.ts y sms.port.ts
// Estos SÍ se implementan ahora con SendGrid/Twilio (más simples).
```

TAREAS:
1. `npx create-turbo@latest` y configurar pnpm workspaces.
2. turbo.json con pipelines: build, test, lint, dev.
3. packages/config con tsconfig.base.json (strict ES2022),
   eslint.base.js, jest.base.js, prettier.config.js.
4. packages/ports con las interfaces listadas arriba — bien tipadas y documentadas.
5. docker-compose.yml local con:
   - postgres:16 (puerto 5432, db cobrai_dev, user cobrai, pass cobrai_dev)
   - redis:7-alpine (puerto 6379)
   - zookeeper:3.8 + kafka:3.7 (puerto 9092 PLAINTEXT)
   - kafka-ui (puerto 8080)
6. .env.example en raíz con todas las variables necesarias.
7. .gitignore global.

Al terminar:
- `pnpm install` sin errores.
- `pnpm run infra:up` levanta todo Docker.
- `pnpm build --filter=@cobrai/ports` compila las interfaces.
```

## 0.2 Schema de base de datos

```
Crea el schema Prisma completo en packages/db/prisma/schema.prisma.

REGLAS PRISMA:
- provider postgresql, previewFeatures: ["multiSchema", "postgresqlExtensions"]
- Extensiones: uuid-ossp, pgcrypto
- Cada modelo: id (uuid default gen_random_uuid()), tenant_id, created_at,
  updated_at, deleted_at nullable.

MODELOS:

1. tenants (id, name, slug unique, plan enum, settings Json, is_active)

2. users (id, tenant_id FK, email, name, role enum admin|manager|agent|viewer,
   password_hash, last_login_at, is_active, soft delete)

3. portfolios (id, tenant_id, name, description, status enum active|paused|archived,
   total_debts Int, total_amount Decimal, currency CHAR(3), imported_at,
   created_by FK users)

4. debtors (id, tenant_id, external_ref nullable, name, type enum person|company,
   tax_id nullable, phones Json[], email, address Json, whatsapp_opt_in default false,
   emotional_profile Json nullable, best_channel enum nullable,
   best_contact_time Json nullable, @@unique [tenant_id, external_ref])

5. debts (id, tenant_id, portfolio_id FK, debtor_id FK, external_ref nullable,
   amount_original Decimal(15,2), amount_outstanding Decimal(15,2),
   currency CHAR(3), due_date Date,
   aging_bucket enum d0_30|d31_60|d61_90|d91_180|d180_plus,
   status enum new|analyzing|active|contacted|promised|plan|disputed|legal_risk|legal|paid_partial|paid_full|written_off,
   ai_score Int nullable 0-100,
   ai_segment enum critical|high|medium|low|minimal nullable,
   risk_level enum nullable,
   best_channel enum nullable,
   strategy_id nullable,
   metadata Json,
   @@index [tenant_id, status],
   @@index [tenant_id, ai_score])

6. contacts (id, tenant_id, debt_id, debtor_id, channel enum, status enum,
   outcome enum nullable, sentiment_score Float nullable, transcript_url nullable,
   duration_seconds Int nullable, agent_type enum ai|human, started_at, ended_at)

7. promises_to_pay (id, tenant_id, debt_id, contact_id nullable,
   amount Decimal, promised_date Date,
   status enum pending|kept|broken|partial, notes)

8. payments (id, tenant_id, debt_id, amount Decimal(15,2), currency,
   gateway enum pix|spei|pse|mercadopago|conekta|card|transfer|cash,
   gateway_ref unique nullable, status enum pending|confirmed|failed|refunded,
   idempotency_key unique, confirmed_at nullable)

9. payment_links (id, tenant_id, debt_id, token uuid unique, amount, currency,
   gateway, status enum active|used|expired|cancelled, expires_at, used_at, payment_id FK nullable)

10. conversations (id, tenant_id, debtor_id, debt_id nullable, channel enum,
    status enum, last_message_at)

11. messages (id, conversation_id FK, direction enum in|out, channel enum,
    content, status enum sent|delivered|read|failed, template_id nullable, sent_at)

12. notification_templates (id, tenant_id, name, channel enum, content,
    variables Json, is_approved Bool, language)

13. contact_consents (id, tenant_id, debtor_id, channel enum, consented_at,
    revoked_at nullable, source)

14. workflow_rules (id, tenant_id, name, trigger enum, condition Json,
    action enum, channel enum, delay_hours Int, priority Int, is_active)

15. workflow_executions (id, tenant_id, debt_id, rule_id, status, executed_at, result Json)

16. audit_logs (id, tenant_id, user_id nullable, action, resource_type,
    resource_id uuid, changes Json, ip_address, user_agent,
    @@index [tenant_id, resource_type, resource_id])

TAREAS:
1. Schema completo con índices y enums.
2. `pnpm prisma generate` y `pnpm prisma migrate dev --name init`.
3. packages/db/src/index.ts exporta PrismaClient singleton.
4. packages/db/src/seed.ts:
   - 1 tenant "Demo Fintech" (slug: "demo")
   - 2 users: admin@demo.com/demo123 (admin) y agent@demo.com/demo123 (agent)
   - 1 portfolio "Cartera Q1 2026" con 30 deudas
   - 15 deudores (mix personas y empresas mexicanas/colombianas)
   - Deudas con aging variado (10 en 0-30d, 8 en 31-60d, 6 en 61-90d, 4 en 91-180d, 2 en 180+)
   - 5 templates de notificación (recordatorio, plan_pago, confirmacion, etc.)
   - 6 workflow_rules ejemplo
5. `pnpm prisma db seed` ejecuta el seed.

Al terminar: `pnpm prisma studio` muestra todas las tablas con datos consistentes.
```

## 0.3 API Gateway y autenticación

```
Configura la autenticación de CobraAI usando Clerk como proveedor de
identidad. Clerk maneja el login, sesiones, MFA, y gestión de usuarios.
El API Gateway valida los tokens de Clerk y añade contexto de tenant a
cada request antes de enrutarlo a los microservicios internos.

JUSTIFICACIÓN DE CLERK EN ESTE STACK
──────────────────────────────────────
- Elimina la complejidad de manejar passwords, refresh tokens y sesiones.
- Login con email/contraseña, magic link, Google y GitHub out-of-the-box.
- SDK para Next.js (middleware nativo) y NestJS (validación JWT).
- Webhooks para sincronizar usuarios a nuestra base de datos.
- Dashboard de Clerk para gestión de usuarios por tenant (organizaciones).
- Multi-tenancy con Clerk Organizations → mapea 1:1 con nuestra tabla tenants.
- Plan gratuito generoso (10,000 MAUs) para el MVP.

ARQUITECTURA DE AUTH CON CLERK
────────────────────────────────

  [Usuario]
      │ login/register
      ▼
  [Clerk (externo)]
      │ emite sessionToken (JWT firmado por Clerk)
      ▼
  [Next.js frontend]
      │ Authorization: Bearer <clerkSessionToken>
      ▼
  [API Gateway NestJS]
      │ verifica JWT con JWKS de Clerk
      │ extrae userId, orgId (= tenant_id), role
      │ inyecta TenantContext en el request
      ▼
  [Microservicios internos]
      │ reciben tenant_id ya validado en header X-Tenant-Id
      ▼
  [Base de datos — RLS activo por tenant_id]

MULTI-TENANCY CON CLERK ORGANIZATIONS
──────────────────────────────────────
- Cada empresa cliente = 1 Clerk Organization.
- orgId de Clerk = tenant_id en nuestra BD (sincronizado vía webhook).
- Los roles en CobraAI (admin|manager|agent|viewer) se definen como
  Clerk Organization Roles con los mismos nombres.
- Al crear una organización en Clerk → webhook crea el tenant en nuestra BD.
- Al agregar un miembro → webhook crea el user en nuestra BD.

─────────────────────────────────────────────────────────────────────────
PARTE 1: CONFIGURACIÓN DE CLERK (PANEL DE CLERK)
─────────────────────────────────────────────────────────────────────────

Antes de escribir código, configurar en https://dashboard.clerk.com:

1. Crear aplicación "CobraAI" en Clerk Dashboard.
2. Habilitar proveedores: Email/Password + Magic Link.
   (Google/GitHub opcionales para MVP, habilitarlos si el cliente pide SSO)
3. En "Organizations": habilitar Clerk Organizations.
4. Crear los roles de organización:
   - admin   → permisos: org:admin
   - manager → permisos: org:manage
   - agent   → permisos: org:member
   - viewer  → permisos: org:member (readonly)
5. En "Webhooks": crear endpoint apuntando a:
   https://<tu-dominio>/api/v1/webhooks/clerk
   Eventos a suscribir:
   - organization.created
   - organization.deleted
   - organizationMembership.created
   - organizationMembership.updated
   - organizationMembership.deleted
   - user.created
   - user.updated
6. Guardar el Webhook Signing Secret (CLERK_WEBHOOK_SECRET).
7. Copiar las claves: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY y CLERK_SECRET_KEY.

─────────────────────────────────────────────────────────────────────────
PARTE 2: FRONTEND (apps/web)
─────────────────────────────────────────────────────────────────────────

Instalar en apps/web:
  pnpm add @clerk/nextjs

VARIABLES DE ENTORNO (apps/web/.env.local):
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
  CLERK_SECRET_KEY=sk_test_...
  NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
  NEXT_PUBLIC_CLERK_SIGN_UP_URL=/register
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

ARCHIVOS A CREAR/MODIFICAR:

1. apps/web/middleware.ts
   Usa el middleware de Clerk para proteger todas las rutas del dashboard.

```typescript
   import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

   // Rutas públicas: login, register, página de pago y webhooks
   const isPublicRoute = createRouteMatcher([
     '/login(.*)',
     '/register(.*)',
     '/pay/(.*)',         // página pública de pagos
     '/api/webhooks/(.*)', // webhooks de Clerk y pasarelas de pago
   ]);

   export default clerkMiddleware((auth, request) => {
     if (!isPublicRoute(request)) {
       auth().protect(); // redirige a /login si no está autenticado
     }
   });

   export const config = {
     matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docb?x?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
   };
```

2. apps/web/app/layout.tsx
   Envuelve toda la app con ClerkProvider.

```typescript
   import { ClerkProvider } from '@clerk/nextjs';

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <ClerkProvider>
         <html lang="es">
           <body>{children}</body>
         </html>
       </ClerkProvider>
     );
   }
```

3. apps/web/app/(auth)/login/page.tsx
   Usa el componente de Clerk (no construir formulario custom).

```typescript
   import { SignIn } from '@clerk/nextjs';

   export default function LoginPage() {
     return (
       <div style={{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center', background:'#0A0806' }}>
         <SignIn
           appearance={{
             variables: {
               colorPrimary: '#D85A30',
               colorBackground: '#130E09',
               colorText: '#F7F3EE',
               colorInputBackground: '#1A1208',
               colorInputText: '#F7F3EE',
               borderRadius: '8px',
             },
             elements: {
               card: { border: '0.5px solid rgba(255,255,255,0.1)' },
               formButtonPrimary: { backgroundColor: '#D85A30', '&:hover': { backgroundColor: '#E8724A' } },
             }
           }}
         />
       </div>
     );
   }
```

4. apps/web/app/(auth)/register/page.tsx
   Similar con <SignUp> de Clerk.

5. apps/web/lib/auth.ts
   Helpers para obtener el token y el contexto del usuario en el servidor.

```typescript
   import { auth, currentUser } from '@clerk/nextjs/server';

   // Obtener el token para enviarlo al API Gateway
   export async function getAuthToken(): Promise<string> {
     const { getToken } = auth();
     const token = await getToken();
     if (!token) throw new Error('No autenticado');
     return token;
   }

   // Obtener tenant_id del org activo
   export function getTenantId(): string {
     const { orgId } = auth();
     if (!orgId) throw new Error('Sin organización activa');
     return orgId;
   }

   // Obtener rol del usuario en la organización actual
   export function getUserRole(): string {
     const { orgRole } = auth();
     return orgRole ?? 'viewer';
   }
```

6. apps/web/lib/api.ts
   Axios instance que incluye el token de Clerk automáticamente.

```typescript
   import axios from 'axios';
   import { auth } from '@clerk/nextjs/server';

   // Para server components / server actions
   export async function getServerApiClient() {
     const { getToken, orgId } = auth();
     const token = await getToken();
     return axios.create({
       baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
       headers: {
         Authorization: `Bearer ${token}`,
         'X-Tenant-Id': orgId,
       },
     });
   }

   // Para client components — usa useAuth de Clerk
   // Ejemplo de uso en client component:
   // const { getToken, orgId } = useAuth();
   // const token = await getToken();
   // axios.get('/api/...', { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': orgId } })
```

7. apps/web/app/(dashboard)/layout.tsx
   Sidebar con datos del usuario de Clerk.

```typescript
   import { UserButton, OrganizationSwitcher } from '@clerk/nextjs';

   // UserButton: avatar con dropdown de logout y perfil (listo, sin código extra)
   // OrganizationSwitcher: cambiar entre tenants si el usuario pertenece a varios
   export default function DashboardLayout({ children }) {
     return (
       <div className="shell">
         <Sidebar>
           {/* ... items de nav ... */}
           <OrganizationSwitcher hidePersonal />
           <UserButton afterSignOutUrl="/login" />
         </Sidebar>
         <main>{children}</main>
       </div>
     );
   }
```

8. apps/web/app/(auth)/onboarding/page.tsx
   Página de onboarding post-registro: crear la organización en Clerk.

```typescript
   import { CreateOrganization } from '@clerk/nextjs';

   // Al crear la org en Clerk → webhook dispara → se crea el tenant en BD
   export default function OnboardingPage() {
     return (
       <div style={{ /* mismos estilos oscuros */ }}>
         <CreateOrganization
           afterCreateOrganizationUrl="/dashboard"
           appearance={{ /* mismos estilos */ }}
         />
       </div>
     );
   }
```

─────────────────────────────────────────────────────────────────────────
PARTE 3: API GATEWAY (apps/api-gateway)
─────────────────────────────────────────────────────────────────────────

Instalar en apps/api-gateway:
  pnpm add @clerk/backend jwks-rsa svix

VARIABLES DE ENTORNO (apps/api-gateway/.env):
  PORT=3000
  CLERK_SECRET_KEY=sk_test_...
  CLERK_PUBLISHABLE_KEY=pk_test_...
  CLERK_WEBHOOK_SECRET=whsec_...
  DATABASE_URL=postgresql://cobrai:cobrai_dev@localhost:5432/cobrai_dev
  REDIS_URL=redis://localhost:6379
  KAFKA_BROKERS=localhost:9092
  SERVICE_PORTFOLIOS_URL=http://localhost:3001
  SERVICE_WORKFLOWS_URL=http://localhost:3002
  SERVICE_NOTIFICATIONS_URL=http://localhost:3003
  SERVICE_PAYMENTS_URL=http://localhost:3004

MÓDULOS A CREAR:

1. ClerkAuthGuard (reemplaza JwtAuthGuard)
   Valida el sessionToken de Clerk usando el JWKS público.

```typescript
   // apps/api-gateway/src/common/guards/clerk-auth.guard.ts
   import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
   import { createClerkClient } from '@clerk/backend';

   @Injectable()
   export class ClerkAuthGuard implements CanActivate {
     private clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

     async canActivate(context: ExecutionContext): Promise<boolean> {
       const request = context.switchToHttp().getRequest();
       const token = this.extractToken(request);

       if (!token) throw new UnauthorizedException('Token requerido');

       try {
         // Verifica el JWT de Clerk y extrae el payload
         const payload = await this.clerk.verifyToken(token);

         // Inyectar contexto en el request para que los interceptors lo usen
         request.clerkUserId  = payload.sub;
         request.clerkOrgId   = payload.org_id;    // = tenant_id en nuestra BD
         request.clerkOrgRole = payload.org_role;  // admin|manager|agent|viewer
         request.clerkPayload = payload;

         return true;
       } catch {
         throw new UnauthorizedException('Token inválido o expirado');
       }
     }

     private extractToken(request: any): string | null {
       const [type, token] = request.headers.authorization?.split(' ') ?? [];
       return type === 'Bearer' ? token : null;
     }
   }
```

2. TenantInterceptor (actualizado para Clerk)
   Extrae org_id del token de Clerk y lo añade como X-Tenant-Id.

```typescript
   // apps/api-gateway/src/common/interceptors/tenant.interceptor.ts
   import { Injectable, NestInterceptor, ExecutionContext, CallHandler, ForbiddenException } from '@nestjs/common';
   import { Observable } from 'rxjs';

   @Injectable()
   export class TenantInterceptor implements NestInterceptor {
     intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
       const request = context.switchToHttp().getRequest();

       // org_id de Clerk = tenant_id en CobraAI
       const tenantId = request.clerkOrgId;
       if (!tenantId) {
         throw new ForbiddenException(
           'El usuario no pertenece a ninguna organización. ' +
           'Completa el onboarding en /onboarding.'
         );
       }

       // Añadir al header para que los microservicios internos lo reciban
       request.headers['x-tenant-id']   = tenantId;
       request.headers['x-user-id']     = request.clerkUserId;
       request.headers['x-user-role']   = request.clerkOrgRole;

       return next.handle();
     }
   }
```

3. RolesGuard (actualizado para Clerk)
   Lee el rol que inyectó TenantInterceptor.

```typescript
   // apps/api-gateway/src/common/guards/roles.guard.ts
   import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
   import { Reflector } from '@nestjs/core';
   import { ROLES_KEY } from '../decorators/roles.decorator';

   const ROLE_HIERARCHY = { admin: 4, manager: 3, agent: 2, viewer: 1 };

   @Injectable()
   export class RolesGuard implements CanActivate {
     constructor(private reflector: Reflector) {}

     canActivate(context: ExecutionContext): boolean {
       const requiredRole = this.reflector.getAllAndOverride<string>(ROLES_KEY, [
         context.getHandler(), context.getClass(),
       ]);
       if (!requiredRole) return true; // sin @Roles() → acceso libre (solo requiere auth)

       const request = context.switchToHttp().getRequest();
       const userRole = request.clerkOrgRole ?? 'viewer';

       const hasPermission =
         (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);

       if (!hasPermission) {
         throw new ForbiddenException(
           `Rol requerido: ${requiredRole}. Tu rol actual: ${userRole}.`
         );
       }
       return true;
     }
   }
```

4. @Roles() decorator (sin cambios vs versión anterior)

```typescript
   // apps/api-gateway/src/common/decorators/roles.decorator.ts
   import { SetMetadata } from '@nestjs/common';
   export const ROLES_KEY = 'roles';
   export const Roles = (role: string) => SetMetadata(ROLES_KEY, role);
```

5. @CurrentUser() decorator (actualizado para Clerk)

```typescript
   // apps/api-gateway/src/common/decorators/current-user.decorator.ts
   import { createParamDecorator, ExecutionContext } from '@nestjs/common';

   export const CurrentUser = createParamDecorator(
     (_data: unknown, ctx: ExecutionContext) => {
       const request = ctx.switchToHttp().getRequest();
       return {
         clerkUserId: request.clerkUserId,
         tenantId:    request.clerkOrgId,
         role:        request.clerkOrgRole,
       };
     },
   );
```

6. WebhookModule — sincroniza Clerk con nuestra BD

   El webhook de Clerk notifica cuando se crean/modifican organizaciones y
   miembros. Así mantenemos nuestra tabla tenants y users en sync.

```typescript
   // apps/api-gateway/src/webhook/clerk-webhook.controller.ts
   import { Controller, Post, Headers, RawBodyRequest, Req, HttpCode } from '@nestjs/common';
   import { Webhook } from 'svix';   // librería oficial de Clerk para verificar webhooks
   import { PrismaService } from '@cobrai/db';

   @Controller('api/v1/webhooks/clerk')
   export class ClerkWebhookController {
     constructor(private prisma: PrismaService) {}

     @Post()
     @HttpCode(200)
     async handleWebhook(
       @Req() req: RawBodyRequest<Request>,
       @Headers('svix-id') svixId: string,
       @Headers('svix-timestamp') svixTimestamp: string,
       @Headers('svix-signature') svixSignature: string,
     ) {
       // 1. Verificar firma con svix
       const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
       let event: any;
       try {
         event = wh.verify(req.rawBody as Buffer, {
           'svix-id': svixId,
           'svix-timestamp': svixTimestamp,
           'svix-signature': svixSignature,
         });
       } catch {
         return { received: false };
       }

       // 2. Manejar cada tipo de evento
       switch (event.type) {

         // Nueva organización → crear tenant en CobraAI
         case 'organization.created':
           await this.prisma.tenant.upsert({
             where:  { id: event.data.id },
             create: {
               id:   event.data.id,
               name: event.data.name,
               slug: event.data.slug,
               plan: 'starter',
               is_active: true,
             },
             update: { name: event.data.name, slug: event.data.slug },
           });
           break;

         // Organización eliminada → desactivar tenant
         case 'organization.deleted':
           await this.prisma.tenant.update({
             where:  { id: event.data.id },
             data:   { is_active: false },
           });
           break;

         // Nuevo miembro en org → crear user en CobraAI
         case 'organizationMembership.created': {
           const { organization, public_user_data, role } = event.data;
           // Normalizar nombre de rol de Clerk a nuestro enum
           const cobraRole = role.replace('org:', '') as 'admin' | 'manager' | 'agent' | 'viewer';
           await this.prisma.user.upsert({
             where:  { id: public_user_data.user_id },
             create: {
               id:        public_user_data.user_id,
               tenant_id: organization.id,
               email:     public_user_data.identifier,
               name:      `${public_user_data.first_name ?? ''} ${public_user_data.last_name ?? ''}`.trim(),
               role:      cobraRole,
               is_active: true,
             },
             update: { role: cobraRole },
           });
           break;
         }

         // Cambio de rol → actualizar user
         case 'organizationMembership.updated': {
           const { public_user_data, role } = event.data;
           const cobraRole = role.replace('org:', '') as 'admin' | 'manager' | 'agent' | 'viewer';
           await this.prisma.user.update({
             where: { id: public_user_data.user_id },
             data:  { role: cobraRole },
           });
           break;
         }

         // Miembro removido → desactivar user
         case 'organizationMembership.deleted':
           await this.prisma.user.update({
             where: { id: event.data.public_user_data.user_id },
             data:  { is_active: false },
           });
           break;
       }

       return { received: true };
     }
   }
```

7. HealthModule — GET /health (sin cambios, verificar DB + Redis + Kafka)

8. app.module.ts (actualizado)

```typescript
   @Module({
     imports: [
       WebhookModule,     // maneja webhooks de Clerk
       HealthModule,      // /health
       RateLimitModule,   // rate limiting con Redis
       ProxyModule,       // enruta a los microservicios
     ],
     providers: [
       { provide: APP_GUARD,       useClass: ClerkAuthGuard },     // auth global
       { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },  // tenant context
       { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
       { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
       { provide: APP_GUARD,       useClass: RolesGuard },         // RBAC global
     ],
   })
   export class AppModule {}
```

   NOTA: El ClerkWebhookController NO debe tener ClerkAuthGuard aplicado
   (es un endpoint público verificado por firma svix). Excluirlo con
   @SkipAuth() o sacándolo del módulo protegido.

─────────────────────────────────────────────────────────────────────────
PARTE 4: MICROSERVICIOS INTERNOS
─────────────────────────────────────────────────────────────────────────

Los microservicios internos (service-portfolios, service-workflows, etc.)
NO validan JWT de Clerk directamente. Solo leen los headers que inyecta
el API Gateway: X-Tenant-Id, X-User-Id, X-User-Role.

Crear en cada microservicio un TenantContextMiddleware:

```typescript
// packages/utils/src/tenant-context.middleware.ts
// Importar en cada microservicio NestJS

import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    const tenantId = req.headers['x-tenant-id'];
    const userId   = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    if (!tenantId) {
      throw new ForbiddenException('X-Tenant-Id requerido');
    }

    // Inyectar en el request para que los servicios lo usen
    req.tenantId = tenantId;
    req.userId   = userId;
    req.userRole = userRole;

    next();
  }
}
```

Y en el Prisma service de cada microservicio, establecer el tenant context
para que RLS funcione automáticamente:

```typescript
async setTenantContext(tenantId: string): Promise<void> {
  await this.prisma.$executeRaw`
    SELECT set_config('app.tenant_id', ${tenantId}, true)
  `;
}
```

─────────────────────────────────────────────────────────────────────────
PARTE 5: ESTRUCTURA DE CARPETAS
─────────────────────────────────────────────────────────────────────────

apps/api-gateway/src/
├── webhook/
│   ├── webhook.module.ts
│   └── clerk-webhook.controller.ts    ← sincroniza Clerk → BD
├── common/
│   ├── guards/
│   │   ├── clerk-auth.guard.ts        ← reemplaza jwt-auth.guard.ts
│   │   └── roles.guard.ts             ← actualizado para Clerk
│   ├── decorators/
│   │   ├── roles.decorator.ts
│   │   ├── skip-auth.decorator.ts     ← @SkipAuth() para webhooks públicos
│   │   └── current-user.decorator.ts
│   └── interceptors/
│       ├── tenant.interceptor.ts      ← extrae org_id de Clerk
│       ├── request-id.interceptor.ts
│       └── logging.interceptor.ts
├── health/
│   └── health.controller.ts           ← GET /health
├── proxy/
│   └── proxy.module.ts                ← enruta a servicios internos
├── app.module.ts
└── main.ts                            ← rawBody habilitado para webhooks svix

NOTA en main.ts — habilitar rawBody para que svix pueda verificar firma:
```typescript
const app = await NestFactory.create(AppModule, { rawBody: true });
```

─────────────────────────────────────────────────────────────────────────
PARTE 6: TESTS
─────────────────────────────────────────────────────────────────────────

UNIT TESTS:
- clerk-auth.guard.spec.ts
  · Token válido → canActivate = true, payload inyectado en request
  · Token ausente → UnauthorizedException
  · Token expirado/inválido → UnauthorizedException
  · Token sin org_id → pasa guard pero TenantInterceptor lanza ForbiddenException

- roles.guard.spec.ts
  · admin puede acceder a ruta @Roles('admin')
  · agent intenta acceder a @Roles('admin') → ForbiddenException
  · Sin @Roles() → acceso libre (solo requiere auth)
  · Jerarquía: admin ≥ manager ≥ agent ≥ viewer

- clerk-webhook.controller.spec.ts
  · organization.created → upsert tenant en BD
  · Firma svix inválida → retorna received: false sin procesar
  · organizationMembership.created → upsert user en BD
  · Rol 'org:admin' → mapeado a 'admin' en BD

E2E:
- Mockear @clerk/backend para retornar payload sintético en tests
  (no llamar a la API real de Clerk en CI):

```typescript
  // apps/api-gateway/test/mocks/clerk.mock.ts
  export const mockClerkPayload = {
    sub: 'user_test_001',
    org_id: 'org_test_001',
    org_role: 'org:admin',
    exp: Math.floor(Date.now() / 1000) + 900,
  };

  jest.mock('@clerk/backend', () => ({
    createClerkClient: () => ({
      verifyToken: jest.fn().mockResolvedValue(mockClerkPayload),
    }),
  }));
```

- auth.e2e-spec.ts:
  · GET /health sin token → 200 (ruta pública)
  · GET /api/v1/portfolios sin token → 401
  · GET /api/v1/portfolios con token mock válido → 200
  · GET /api/v1/portfolios con token de usuario sin org → 403

─────────────────────────────────────────────────────────────────────────
VARIABLES DE ENTORNO COMPLETAS (.env.example actualizado)
─────────────────────────────────────────────────────────────────────────

# apps/web/.env.example
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/register
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
NEXT_PUBLIC_API_URL=http://localhost:3000

# apps/api-gateway/.env.example
PORT=3000
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://cobrai:cobrai_dev@localhost:5432/cobrai_dev
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
SERVICE_PORTFOLIOS_URL=http://localhost:3001
SERVICE_WORKFLOWS_URL=http://localhost:3002
SERVICE_NOTIFICATIONS_URL=http://localhost:3003
SERVICE_PAYMENTS_URL=http://localhost:3004

─────────────────────────────────────────────────────────────────────────
CHECKLIST DE FINALIZACIÓN DE ESTA ETAPA
─────────────────────────────────────────────────────────────────────────
□ Aplicación creada en Clerk Dashboard con org habilitadas y 4 roles.
□ Webhook configurado en Clerk → apunta a /api/v1/webhooks/clerk.
□ pnpm test --filter=api-gateway pasa con ≥ 80% cobertura.
□ Frontend muestra <SignIn> con colores de CobraAI (coral #D85A30).
□ Crear una organización en Clerk → aparece tenant en BD automáticamente.
□ Invitar usuario a la org → aparece user en BD con rol correcto.
□ GET /api/v1/portfolios sin token → 401.
□ GET /api/v1/portfolios con token válido + org → 200.
□ Usuario con rol 'agent' en ruta @Roles('admin') → 403.
□ GET /health sin token → 200 (siempre pública).
□ rawBody habilitado en main.ts para verificación svix.
□ CLERK_WEBHOOK_SECRET en .env, nunca en código.

NO CONSTRUIR EN ESTA ETAPA (lo hace Clerk):
✗ Formulario de login custom con email/password.
✗ Lógica de hash de passwords (bcrypt).
✗ Refresh tokens manuales.
✗ Tabla de sesiones en BD.
✗ Endpoints /auth/login, /auth/logout, /auth/refresh.
   (Clerk maneja todo esto internamente con sus SDKs)
```

---

# ══════════════════════════════════════════════
# ETAPA 1 — CORE: PORTAFOLIOS Y DEUDAS (semanas 4–8)
# Tiempo estimado en Cursor: 4–6 horas
# ══════════════════════════════════════════════

## 1.1 Servicio de portafolios

```
Crea apps/service-portfolios (NestJS, puerto 3001).

ENDPOINTS:

Portafolios:
- GET    /api/v1/portfolios               (paginado + filtros)
- POST   /api/v1/portfolios               (crear)
- GET    /api/v1/portfolios/:id           (detalle + stats)
- PATCH  /api/v1/portfolios/:id
- DELETE /api/v1/portfolios/:id           (soft delete)
- GET    /api/v1/portfolios/:id/stats     (KPIs por aging y status)

Deudas:
- GET    /api/v1/debts                    (filtros: status, aging, score, segment)
- POST   /api/v1/debts                    (crear deuda + deudor)
- GET    /api/v1/debts/:id                (detalle con timeline)
- PATCH  /api/v1/debts/:id
- GET    /api/v1/debts/:id/timeline       (cronológico)
- POST   /api/v1/debts/bulk               (máximo 500 por request)
- POST   /api/v1/debts/:id/resegment      (encolar re-scoring)

Deudores:
- GET    /api/v1/debtors/:id              (perfil completo)
- PATCH  /api/v1/debtors/:id              (actualizar contacto, opt-in)

Importación:
- POST   /api/v1/portfolios/:id/import    (multipart, CSV o XLSX)
  Retorna { job_id, status: 'queued', estimated_rows }
- GET    /api/v1/portfolios/:id/import/:job_id  (progreso)

MAPPING CSV obligatorio:
external_ref, debtor_name, debtor_tax_id, debtor_phone, debtor_email,
amount, currency, due_date
Opcional: debtor_type, address_city, address_country, metadata_*

MÓDULOS:
- PortfoliosModule (CRUD + stats con queries agregadas)
- DebtsModule (CRUD + filtros + cursor pagination)
- DebtorsModule (CRUD + merge por tax_id)
- ImportModule (Bull queue + Redis, papaparse + exceljs)
- AuditModule (interceptor global que loguea TODA escritura en audit_logs)
- KafkaModule (publica cobrai.debt.created, cobrai.debt.updated)

⚠️ INTEGRACIÓN CON SCORING IA (PUERTO STUB):
- Crea AIScoringModule que inyecta AIScoringPort de @cobrai/ports.
- Implementa StubAIScoringAdapter que devuelve scores SINTÉTICOS:
  - Calcula un score determinista a partir de aging + amount + has_whatsapp
  - Fórmula: score = clamp(100 - aging_days * 0.3 + (has_whatsapp ? 15 : 0), 0, 100)
  - Segmento: critical (<30), high (30-49), medium (50-69), low (70-84), minimal (≥85)
  - best_channel: 'whatsapp' si opt-in, sino 'voice' si score<50, sino 'email'
- Configura en app.module.ts un binding: useClass: StubAIScoringAdapter
- Cuando esté listo el servicio real, solo se cambia useClass por HttpAIScoringAdapter
- El módulo expone: scoringService.scoreDebt(debt) que internamente llama al puerto

KAFKA EVENTS:
Publicar:
- cobrai.debt.created           → al crear deuda (consumido por workflows + scoring real cuando exista)
- cobrai.debt.updated           → al cambiar status o monto
- cobrai.portfolio.imported     → al terminar import con resumen

Consumir (cuando otros servicios publiquen):
- cobrai.payment.confirmed      → actualizar amount_outstanding y status
- cobrai.debt.segmented         → actualizar ai_score, ai_segment, risk_level

VALIDACIONES DTO (class-validator):
- amount: positivo, máx 2 decimales
- currency: ISO 4217 (3 letras MXN/COP/BRL/USD)
- due_date: válida, no >10 años en futuro
- phones: array de E.164 (+52..., +57..., +55...)
- email: formato válido o null

TESTS:
- portfolios.service.spec.ts (CRUD + stats)
- debts.service.spec.ts (CRUD + bulk + filtros)
- csv-parser.service.spec.ts (válido, errores, encoding UTF-8/Latin1)
- stub-ai-scoring.spec.ts (scores deterministas para mismos inputs)
- E2E: crear portfolio → importar CSV de 50 filas → 50 deudas con score asignado

Al terminar:
- Import de 100 deudas en <5 segundos
- Cada deuda creada recibe score sintético inmediato (vía stub)
- Kafka emite cobrai.debt.created por cada deuda
- GET /api/v1/debts?filter[ai_segment]=medium funciona
```

## 1.2 Frontend: dashboard principal

```
Crea apps/web con Next.js 14 App Router.

RUTAS:
/login                          → formulario de login
/dashboard                      → dashboard ejecutivo (home post-login)
/portfolios                     → lista de portafolios
/portfolios/[id]                → detalle con tabla de deudas
/portfolios/[id]/import         → drag-and-drop CSV/Excel
/debts/[id]                     → detalle de deuda con timeline
/debtors/[id]                   → perfil de deudor con todas sus deudas
/settings                       → configuración (templates, reglas, equipo)
/audit                          → audit log (solo admin)

DASHBOARD (/dashboard):

1. KPI Row (4 cards):
   - Tasa de recuperación (% + trend mes anterior)
   - Monto recuperado ($ + comparativo meta)
   - DSO promedio (días + benchmark industria)
   - Cuentas activas (total + alerta de riesgo alto)

2. Gráfico de recuperación por canal (Recharts):
   - Barras apiladas: WhatsApp, Voz, Email, SMS
   - Últimos 6 meses
   - Datos reales de la BD agrupados por mes y canal

3. Tabla de cuentas prioritarias:
   - Columnas: Deudor, Monto, Aging, Estado, Score IA (barra visual), Acciones
   - Ordenable por cualquier columna (server-side)
   - Paginación cursor-based
   - Búsqueda con debounce 300ms
   - Click en fila → /debts/[id]

4. Donut chart de segmentación IA (sidebar):
   - 5 segmentos: critical, high, medium, low, minimal
   - Datos reales de la API

5. Feed de alertas:
   - Últimas 5 alertas (workflow_executions con result.alert = true)
   - Click → detalle de la deuda asociada

DISEÑO:
- Paleta: fondo claro #FAFAFA (modo claro) y #0A0806 (modo oscuro)
- Acento primario: coral #D85A30
- Positivo: teal #0F6E56
- Alerta: rojo #A32D2D
- Tipografía: Geist Sans (next/font/local o Google Fonts)
- Sidebar fijo 220px, topbar con avatar y filtros
- Skeleton loaders en todas las secciones
- Toast notifications (sonner)
- Toggle modo claro/oscuro en topbar

ESTADO Y DATA FETCHING:
- React Query (@tanstack/react-query) con revalidación automática
- Zustand para estado global (usuario, tenant activo, tema)
- Axios instance con interceptors para JWT (auto-refresh al recibir 401)
- httpOnly cookies para tokens (NO localStorage)

AUTH:
- middleware.ts redirige a /login si no hay JWT válido
- Refresh transparente del access token

ESTRUCTURA:
apps/web/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx (sidebar + topbar)
│   │   ├── dashboard/page.tsx
│   │   ├── portfolios/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── import/page.tsx
│   │   ├── debts/[id]/page.tsx
│   │   ├── debtors/[id]/page.tsx
│   │   ├── settings/page.tsx
│   │   └── audit/page.tsx
│   ├── api/ (Next.js API routes — proxy al gateway)
│   ├── layout.tsx
│   └── middleware.ts
├── components/
│   ├── ui/ (shadcn)
│   ├── dashboard/ (KPICard, RecoveryChart, DebtTable, AIFeed, SegmentDonut)
│   ├── portfolios/ (PortfolioCard, ImportDropzone, ImportProgress)
│   ├── debts/ (DebtDetail, TimelineEvent, ScoreCircle, ChannelIcon)
│   └── shared/ (Sidebar, Topbar, DataTable, StatusBadge, ScoreBar, ThemeToggle)
├── lib/ (api.ts, auth.ts, utils.ts, formatters.ts)
└── store/ (auth.store.ts, theme.store.ts)

TESTS:
- KPICard.test.tsx (datos OK, skeleton sin datos)
- DebtTable.test.tsx (paginación, búsqueda, sort)
- auth flow test (redirect si no autenticado)

Al terminar:
- `pnpm dev` levanta web en http://localhost:3000
- Login con admin@demo.com / demo123 muestra dashboard con datos del seed
- Tabla de deudas carga, paginable, buscable, ordenable
- Gráfico de recuperación muestra datos reales
- Toggle de modo claro/oscuro funciona y persiste
```

---

# ══════════════════════════════════════════════
# ETAPA 2 — WORKFLOWS Y AUTOMATIZACIÓN (semanas 9–12)
# Tiempo estimado en Cursor: 3–4 horas
# ══════════════════════════════════════════════

## 2.1 Servicio de workflows

```
Crea apps/service-workflows (NestJS, puerto 3002).

RESPONSABILIDADES:
- Orquestar el flujo completo de cada deuda (máquina de estados).
- Ejecutar automatizaciones programadas (cron jobs).
- Decidir cuándo y cómo contactar a cada deudor.
- Disparar contactos publicando cobrai.contact.requested.
- Escalar a humano o legal según criterios.

MÁQUINA DE ESTADOS (XState o custom):

Transiciones:
new → analyzing       (al recibir cobrai.debt.created)
analyzing → active    (al recibir cobrai.debt.segmented)
active → contacted    (cuando se inicia contacto)
contacted → promised  (deudor promete pagar)
contacted → disputed  (deudor disputa)
active → no_response  (3 intentos sin respuesta)
no_response → legal_risk (aging>90 AND score<30)
promised → paid_full  (cobrai.payment.confirmed)
promised → broken     (fecha prometida pasada sin pago)
broken → active       (re-ingresa al flujo)
legal_risk → legal    (aprobación manual o automática)
active → paid_full    (cobrai.payment.confirmed)

SCHEDULER (cron cada 4 horas con @nestjs/schedule):
1. Recalcular aging_bucket de todas las deudas activas.
2. Promesas vencidas → transición a broken.
3. Identificar deudas a contactar hoy según workflow_rules.
4. Para cada deuda elegible → publicar cobrai.contact.requested.
5. Identificar deudas para escalar a legal automáticamente.

CRITERIOS DE ESCALAMIENTO LEGAL (defaults configurables):
- aging_days > 180 AND score < 20 AND sin pagos en 90d
- 5+ promesas rotas
- opt-out en todos los canales
- monto > umbral del tenant (default $10K USD equiv)

ENDPOINTS:
- GET  /api/v1/workflows/queue          (cola del día agrupada por canal)
- POST /api/v1/workflows/trigger/:debt_id (forzar re-evaluación)
- GET  /api/v1/workflows/rules          (listar reglas del tenant)
- POST /api/v1/workflows/rules          (crear/actualizar)
- PATCH /api/v1/workflows/rules/:id     (editar)
- DELETE /api/v1/workflows/rules/:id    (desactivar)
- GET  /api/v1/workflows/stats          (estadísticas: contactos hoy, escalamientos, etc.)

ESTRUCTURA DE REGLA:
{
  name: string,
  trigger: 'aging_reached' | 'score_below' | 'no_response' | 'promise_broken',
  condition: { field, operator, value },
  action: 'send_reminder' | 'call_ai' | 'escalate_human' | 'escalate_legal',
  channel: 'whatsapp' | 'voice' | 'email' | 'sms',
  delay_hours: number,
  is_active: boolean
}

KAFKA:
Consumir:
- cobrai.debt.created           → iniciar máquina de estado (new → analyzing)
- cobrai.debt.segmented         → analyzing → active + generar plan de contacto
- cobrai.contact.completed      → actualizar estado según outcome
- cobrai.payment.confirmed      → transición a paid_full o paid_partial

Publicar:
- cobrai.contact.requested      → notifications agarra y ejecuta el contacto
- cobrai.debt.escalated         → al escalar a legal/humano

PÁGINA FRONTEND (/settings/automation):
- Lista de reglas activas con toggle on/off
- Wizard de 3 pasos para crear regla nueva
- Vista de cola del día (count por canal, prioridad)
- Stats: contactos hoy, promesas activas, escalamientos

TESTS:
- state-machine.spec.ts (todas las transiciones válidas e inválidas)
- scheduler.spec.ts (cron correctamente filtra deudas a contactar)
- rule-engine.spec.ts (evalúa condition correctamente)
- E2E: regla "score<30 después de 60 días → escalar a humano" se ejecuta

Al terminar:
- Scheduler corre cada 4h, log estructurado de ejecuciones en workflow_executions
- 5 reglas básicas creadas en seed
- Cola del día visible en frontend con datos reales
- Una deuda nueva pasa de new → analyzing → active en <10s
```

---

# ══════════════════════════════════════════════
# ETAPA 3 — NOTIFICACIONES (EMAIL Y SMS) + STUBS DE CANALES IA
# (semanas 13–16) — Tiempo estimado: 3–5 horas
# ══════════════════════════════════════════════

## 3.1 Servicio de notificaciones

```
Crea apps/service-notifications (NestJS, puerto 3003).

ALCANCE DE ESTA ETAPA:
- Email (SendGrid) — implementación COMPLETA real
- SMS (Twilio) — implementación COMPLETA real
- WhatsApp — solo STUB que cumple WhatsAppPort, se conectará al servicio real después
- Voice — solo STUB que cumple VoiceAgentPort, se conectará al servicio real después

RESPONSABILIDADES:
- Orquestar contactos omnicanal (waterfall).
- Compliance: horarios por país, frecuencia, consent, opt-out.
- Registrar cada intento de contacto en tabla contacts.
- Mantener conversaciones unificadas multi-canal.

ENDPOINTS:
- POST /api/v1/contacts                   (iniciar contacto manual)
  Body: { debt_id, channel, template_id?, scheduled_at? }
- GET  /api/v1/contacts?debt_id=:id       (historial)
- GET  /api/v1/conversations/:debtor_id   (conversación unificada)
- POST /api/v1/webhooks/sendgrid          (apertura, clic, bounce de SendGrid)
- POST /api/v1/webhooks/twilio            (delivery status de Twilio)
- POST /api/v1/webhooks/whatsapp          (⚠️ existe el endpoint pero internamente solo loguea — listo para conectar)
- POST /api/v1/templates                  (crear template)
- GET  /api/v1/templates                  (listar templates del tenant)

ADAPTADORES:

1. EmailAdapter (SendGrid — implementación REAL)
   - sendTemplate({ to, template_id, variables, tenant_id })
   - Manejo de tracking (apertura, clics)
   - Webhook validación de firma SendGrid
   - Auto opt-out al bounce permanente

2. SMSAdapter (Twilio — implementación REAL)
   - sendSMS({ to, body, tenant_id })
   - Máx 160 chars, incluye link de pago corto
   - Recepción de STOP → opt-out
   - Webhook delivery status

3. WhatsAppAdapter (STUB — cumple WhatsAppPort de @cobrai/ports)
   - Recibe la llamada de sendTemplate
   - Crea el registro en messages con status='queued_for_external_service'
   - Publica evento cobrai.whatsapp.send_requested en Kafka (que el servicio externo consumirá cuando esté listo)
   - Retorna { message_id: uuid, status: 'sent' } para que el flujo continúe
   - Cuando el servicio externo real esté listo, solo se reemplaza el binding del puerto

4. VoiceAgentAdapter (STUB — cumple VoiceAgentPort)
   - Recibe initiateCall
   - Crea registro en contacts con status='queued_for_external_service'
   - Publica cobrai.voice.call_requested en Kafka
   - Retorna { call_id: uuid, status: 'queued' }
   - Servicio externo lo conectará después

COMPLIANCE ENGINE (crítico — implementar bien desde el inicio):
Antes de CUALQUIER envío:
1. ¿Hay consent registrado para este canal? Si no, no enviar.
2. ¿Está en horario permitido del país del deudor?
   MX: 7am–10pm lun-sáb · BR: 7am–10pm lun-dom · CO: 6am–10pm · default: 8am–9pm
3. ¿Ya se contactó hoy por este canal? Máx 1 por día por canal.
4. ¿Está en opt-out global o por canal?
5. Si falla cualquiera → encolar para próximo horario válido + loguear motivo.

WATERFALL DE CANALES:
Cuando se recibe cobrai.contact.requested, el orquestador:
1. WhatsApp (si opt-in) → esperar 4h respuesta
2. Voice (si phone) → esperar 24h
3. Email → esperar 48h
4. SMS → esperar 72h
5. Sin respuesta → publicar cobrai.contact.failed.no_response

KAFKA:
Consumir:
- cobrai.contact.requested      → ejecutar waterfall
- cobrai.whatsapp.message_received  (que publicará el servicio externo de WA)
- cobrai.voice.call_completed       (que publicará el servicio externo de voz)

Publicar:
- cobrai.contact.completed      (outcome, sentiment, transcript_url)
- cobrai.contact.failed.no_response
- cobrai.whatsapp.send_requested  (para servicio externo)
- cobrai.voice.call_requested     (para servicio externo)

TEMPLATES MVP (seed 5 templates):
1. cobrai_recordatorio_amable (canal: email, whatsapp)
2. cobrai_oferta_plan_pago (canal: email, whatsapp)
3. cobrai_confirmacion_pago (canal: email, sms, whatsapp)
4. cobrai_promesa_vencida (canal: email, sms, whatsapp)
5. cobrai_aviso_legal (canal: email)

Cada template tiene: variables ({nombre}, {monto}, {empresa}, {link_pago}), idioma (es-MX, es-CO, pt-BR, es-AR).

PÁGINA FRONTEND:
/settings/templates → CRUD de templates con preview
/debts/[id] → botón "Contactar ahora" abre modal con selector de canal y template
/debtors/[id] → tab "Conversaciones" muestra hilo unificado multi-canal

TESTS:
- compliance.service.spec.ts (todos los casos: horario, frecuencia, opt-out, consent)
- email-adapter.spec.ts (envío + webhook handling con mocks)
- waterfall.spec.ts (escala correctamente entre canales)
- stub-whatsapp.spec.ts (cumple contrato del puerto, publica evento Kafka correcto)
- E2E: contacto programado fuera de horario → bloqueado → re-programado para mañana 9am

Al terminar:
- Email real enviado vía SendGrid sandbox funciona y aparece en BD
- SMS real enviado vía Twilio trial número funciona
- WhatsApp se "envía" via stub (no llega a destino) pero genera evento Kafka correcto
- Voice se "encola" via stub y genera evento Kafka correcto
- Compliance bloquea correctamente envíos fuera de horario
- Frontend muestra conversación unificada con todos los canales mezclados
```

---

# ══════════════════════════════════════════════
# ETAPA 4 — PAGOS Y RECONCILIACIÓN (semanas 17–20)
# Tiempo estimado en Cursor: 3–4 horas
# ══════════════════════════════════════════════

## 4.1 Servicio de pagos

```
Crea apps/service-payments (NestJS, puerto 3004).

RESPONSABILIDADES:
- Generar links de pago únicos por deuda (con expiración).
- Integrar pasarelas LATAM (Conekta MX + Mercado Pago + stripe).
- Recibir webhooks de confirmación con verificación de firma.
- Actualizar saldo de deudas vía Kafka.
- Sincronizar pagos al ERP del tenant (queda como evento, integración real fase posterior).

ENDPOINTS:
- POST /api/v1/payment-links              (generar link)
  Body: { debt_id, amount?, expires_in_hours? (default 48) }
  Response: { link_id, url, expires_at, amount, currency, gateway }

- GET  /api/v1/payment-links/:token       (página pública — NO requiere auth)
  Response: { deudor_partial_name, amount, currency, gateway_options[], company_name }

- POST /api/v1/payments/checkout/:token   (crear order en el gateway)
  Response: { gateway_payment_url } → redirección al checkout del gateway

- POST /api/v1/payments/webhook/conekta   (Conekta — MX)
- POST /api/v1/payments/webhook/mp        (Mercado Pago — CO/AR/BR)
- GET  /api/v1/payments?debt_id=:id       (historial)
- POST /api/v1/payments/:id/refund        (reembolso parcial o total)

PASARELAS MVP:

1. Conekta (México):
   - Tarjeta + OXXO Pay + SPEI
   - Crear Order con line_items
   - Webhook: order.paid → confirmar
   - Verificar firma HMAC del webhook

2. Mercado Pago (CO/AR/BR):
   - Tarjeta + PSE (CO) + Pix (BR)
   - Crear preference
   - Webhook: payment.approved → confirmar
   - Verificar X-Signature header

3. Link genérico (fallback):
   - Genera instrucciones de transferencia bancaria
   - Marcado manual de pago por el equipo del tenant (con audit)

LÓGICA DE CONFIRMACIÓN (CRÍTICA — debe ser bulletproof):
Al recibir webhook de pago:
1. Verificar firma → si falla, log y retornar 401.
2. Verificar idempotencia: ¿ya procesamos este gateway_payment_id?
   Sí → retornar 200 sin hacer nada (idempotente).
3. Insertar payment con status=confirmed dentro de transacción Prisma.
4. Publicar cobrai.payment.confirmed en Kafka.
5. Retornar 200 al gateway SIEMPRE (evitar reintentos).

NOTA: El service-portfolios consume cobrai.payment.confirmed y actualiza
debt.amount_outstanding y debt.status. NO actualizar directamente desde payments.

PÁGINA PÚBLICA DE PAGO:
Crea apps/web/app/pay/[token]/page.tsx (ruta pública, sin layout dashboard):
- Logo CobraAI + nombre de la empresa acreedora
- Muestra: nombre parcial del deudor (Juan P***), monto, moneda
- Selector de método según país (detectado por IP geolocation)
- Botón "Pagar ahora" → POST /api/v1/payments/checkout/:token → redirect
- Confirmación al volver: "Tu pago de $X fue recibido"
- Sin login requerido (acceso solo por token único)
- Diseño limpio, mobile-first (la mayoría pagará desde celular)

.env.example:
CONEKTA_PRIVATE_KEY=
CONEKTA_WEBHOOK_SECRET=
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
PAYMENT_LINK_BASE_URL=https://pay.cobrai.io

TESTS:
- payment-link.service.spec.ts (generación, expiración, unicidad)
- webhook-validator.spec.ts (firma válida/inválida cada gateway)
- payment-confirmation.spec.ts (idempotencia + transacción atómica)
- E2E: generar link → simular webhook Conekta sandbox → debt.status = paid_full

Al terminar:
- Crear deuda → generar link → abrir /pay/:token sin login → ver detalles
- Simular pago en sandbox de Conekta → 2s después debt.status=paid_full
- Dashboard refleja el pago en <30s (vía polling de React Query)
```

---

# ══════════════════════════════════════════════
# ETAPA 5 — COMPLIANCE, AUDIT Y CALIDAD (semanas 21–24)
# Tiempo estimado en Cursor: 3–4 horas
# ══════════════════════════════════════════════

## 5.1 Compliance LATAM y audit completo

```
Crea packages/compliance con motor de reglas por país.

REGLAS POR PAÍS (implementar para MX, BR, CO; resto usa defaults):

México (PROFECO + CONDUSEF + LFPDPPP):
- Horario: 7am–10pm hora local, lun-sáb (NO domingo).
- Máx 3 contactos por semana por deudor.
- Prohibido contactar terceros sin autorización escrita.
- Obligatorio identificar al acreedor en cada contacto.
- Prohibido amenazar con acciones inexistentes.
- Consentimiento explícito para uso de datos.

Brasil (CDC + LGPD):
- Horario: 7am–10pm hora local, lun-dom.
- Máx 1 contacto por día por canal.
- Prohibido exposición pública de la deuda.
- LGPD: legítimo interés legal pero opt-out inmediato obligatorio.
- Consent con timestamp para WhatsApp.

Colombia (Ley 1581 + SFC):
- Horario: 6am–10pm hora local.
- Máx 1 canal diferente por semana.
- Prohibido contactar lugar de trabajo sin autorización.

IMPLEMENTACIÓN:
- ComplianceService.checkContact(debtor_id, channel, country): Promise<{
    allowed: boolean;
    reason?: string;
    next_allowed_at?: Date;
  }>
- ConsentService (registrar, revocar, verificar)
- OptOutService (lista negra global y por canal)
- AuditService (registrar CADA decisión de compliance con motivo)

EXPONER COMO PAQUETE:
service-notifications IMPORTA @cobrai/compliance y lo llama antes de cada envío.
service-workflows lo consulta al programar contactos (descarta los no permitidos).

AUDIT TRAIL TOTAL:
Asegurar que TODO acción quede en audit_logs:
- Creación/modificación de deudas
- Cada intento de contacto (exitoso o bloqueado)
- Pagos recibidos
- Cambios de estado de deuda
- Login/logout
- Cambios de configuración
- Acceso a datos sensibles de deudores (GET /debtors/:id)

PÁGINA FRONTEND /audit:
- Tabla filtrable: usuario, acción, fecha, recurso
- Solo accesible para rol admin
- Exportar CSV del rango filtrado

TESTS:
- compliance.service.spec.ts (cubrir todos los casos por país)
- audit.interceptor.spec.ts (cada operación de escritura genera audit_log)
- E2E: usuario agent intentando ver /audit → 403
```

## 5.2 Tests de integración y E2E

```
Suite completa de testing.

INTEGRACIÓN (Testcontainers con Postgres y Redis reales):
- api-gateway/test/auth.e2e-spec.ts
- api-gateway/test/rbac.e2e-spec.ts
- service-portfolios/test/import.e2e-spec.ts (CSV de 50 filas → 50 deudas)
- service-portfolios/test/debts-crud.e2e-spec.ts
- service-notifications/test/compliance.e2e-spec.ts (envío bloqueado)
- service-notifications/test/waterfall.e2e-spec.ts
- service-workflows/test/state-machine.e2e-spec.ts
- service-payments/test/webhook.e2e-spec.ts (firma + idempotencia)

E2E con Playwright (apps/web/e2e/):
- login.spec.ts (válido + inválido + lockout 5 intentos)
- portfolio-import.spec.ts (drag-drop CSV → verificar deudas en tabla)
- dashboard-kpis.spec.ts (todos los KPIs cargan datos reales)
- debt-detail.spec.ts (timeline, score, acciones)
- payment-flow.spec.ts (generar link → abrir página pública → simular pago)
- audit-access.spec.ts (admin ve, agent no)

SCRIPT QA COMPLETO (scripts/qa-check.sh):
1. pnpm lint (todos los servicios)
2. pnpm test (unit tests + coverage report)
3. pnpm test:e2e (Testcontainers)
4. pnpm playwright test
5. Reporte consolidado

Al terminar: scripts/qa-check.sh pasa al 100% con cobertura ≥ 80% global.
```

---

# ══════════════════════════════════════════════
# ETAPA 6 — DEPLOY MVP (semanas 25–28)
# Tiempo estimado en Cursor: 2–3 horas
# ══════════════════════════════════════════════

## 6.1 Docker y deploy

```
Preparar el MVP para deploy en servidor único.

DOCKERFILES (uno por servicio):
- Multi-stage build (builder + runner)
- Non-root user
- .dockerignore en cada servicio
- HEALTHCHECK con curl al /health
- Next.js: standalone output, FROM node:20-alpine
- NestJS: solo dist/, FROM node:20-alpine
- Python (cuando exista): FROM python:3.12-slim, sin dev deps

docker-compose.prod.yml:
- Todos los servicios con restart: unless-stopped
- Nginx como reverse proxy (puertos 80/443)
- Certbot/Let's Encrypt automático
- Variables de entorno desde .env.prod (NUNCA commiteado)
- Volúmenes para Postgres data y uploads
- Red interna; solo Nginx expone al host

NGINX CONFIG:
- /          → web (Next.js :3000)
- /api       → api-gateway (:3001)
- /pay       → web (página pública de pagos)
- WebSocket upgrade para futuras notificaciones en tiempo real
- Rate limit: 10 req/s por IP en /api/v1/auth
- Gzip + cache headers para assets estáticos

GITHUB ACTIONS (.github/workflows/ci.yml + deploy.yml):
- CI: trigger en push y PR → lint + test + build
- Deploy: trigger en push a main → SSH al servidor + docker compose pull + up
- Secrets: SERVER_HOST, SERVER_USER, SERVER_SSH_KEY, DATABASE_URL, JWT_SECRET, etc.

CHECKLIST FINAL DEL MVP:
□ pnpm run infra:up levanta stack local sin errores
□ Login con admin@demo.com / demo123 funciona
□ Crear portfolio + importar CSV 20 deudas funciona
□ Score IA sintético aparece en <5s (vía stub)
□ Enviar email de prueba desde dashboard funciona (SendGrid sandbox)
□ Enviar SMS de prueba funciona (Twilio trial)
□ Enviar WhatsApp "via stub" genera evento Kafka cobrai.whatsapp.send_requested
□ Generar link de pago + abrir página /pay/:token sin login
□ Webhook Conekta sandbox confirma pago → debt actualizada
□ Compliance bloquea envíos fuera de horario
□ Audit log registra todas las acciones
□ scripts/qa-check.sh pasa al 100%
□ docker compose build sin errores
□ Deploy en servidor staging funcional
```

---

# ══════════════════════════════════════════════
# CUANDO LOS SERVICIOS EXTERNOS ESTÉN LISTOS
# (NO ES PARTE DEL MVP — DOCUMENTACIÓN FUTURA)
# ══════════════════════════════════════════════

```
Cuando el equipo de IA termine los servicios de voz y WhatsApp:

1. Servicio AI-Scoring (Python FastAPI):
   - Implementa el endpoint POST /score que recibe DebtFeatures y devuelve ScoringResult.
   - En CobraAI, cambiar el binding:
     // Antes
     { provide: 'AIScoringPort', useClass: StubAIScoringAdapter }
     // Después
     { provide: 'AIScoringPort', useClass: HttpAIScoringAdapter }
   - HttpAIScoringAdapter llama al endpoint del servicio Python.
   - Configurar AI_SCORING_URL en .env.

2. Servicio WhatsApp Agent:
   - Consume cobrai.whatsapp.send_requested de Kafka.
   - Envía vía Meta WA Business API.
   - Publica cobrai.whatsapp.message_received para mensajes entrantes.
   - En CobraAI, reemplazar StubWhatsAppAdapter por KafkaWhatsAppAdapter
     que solo publica el evento (no espera respuesta directa).

3. Servicio Voice Agent:
   - Consume cobrai.voice.call_requested.
   - Llama vía Retell/ElevenLabs.
   - Publica cobrai.voice.call_completed con transcript y outcome.
   - En CobraAI, reemplazar StubVoiceAdapter por KafkaVoiceAdapter.

Cambios necesarios cuando se hagan los swaps:
- Solo el módulo correspondiente cambia su `provide` en app.module.ts.
- Ningún otro código del MVP necesita cambios.
- Tests del puerto siguen pasando — verifican el contrato, no la implementación.

Esto es la razón por la que se trabajaron con interfaces desde el día 1.
```

---

# ══════════════════════════════════════════════
# COMANDOS DEL DÍA A DÍA
# ══════════════════════════════════════════════

```bash
# Infraestructura local
pnpm run infra:up
pnpm run infra:down

# Desarrollo (todos los servicios)
pnpm dev

# Solo un servicio
pnpm dev --filter=service-portfolios
pnpm dev --filter=web

# Tests
pnpm test                                    # todos los unit tests
pnpm test --filter=api-gateway               # uno solo
pnpm test --filter=api-gateway -- --coverage # con cobertura
pnpm test:e2e                                # integración con Testcontainers
pnpm playwright test                         # E2E

# Lint
pnpm lint
pnpm lint:fix

# Prisma
cd packages/db && pnpm prisma migrate dev --name nombre
cd packages/db && pnpm prisma migrate reset
cd packages/db && pnpm prisma studio
cd packages/db && pnpm prisma db seed

# Kafka UI
open http://localhost:8080

# Build producción
pnpm build

# QA completo
bash scripts/qa-check.sh
```

---

# ══════════════════════════════════════════════
# NOTAS PARA CURSOR
# ══════════════════════════════════════════════

1. Pega el PROMPT GLOBAL primero como regla del proyecto (.cursor/rules/cobrai.mdc).
2. En sesiones nuevas, comienza con: "Aplica las reglas definidas en .cursor/rules/cobrai.mdc"
3. Cuando Cursor genere código que rompa una regla, corrígelo explícitamente apuntando a la regla violada.
4. Para cambios cross-cutting, usa @codebase en Cursor Composer.
5. TDD recomendado: pide los tests antes del código de implementación.
6. Si un servicio externo (IA, voz, WA) aparece llamado directamente en lugar de
   por el puerto, ES UN BUG — corregir inmediatamente.
7. Usa @web en Cursor para consultar docs actualizadas de Prisma, NestJS, Kafka.
8. Si un archivo crece más de 500 líneas, pide refactor.
9. Cada PR que toque un puerto debe verificar que el contrato siga estable.
```
