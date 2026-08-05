# Phase 8: Configuración por Tenant (BYO): canales e identidad de cobro - Context

**Gathered:** 2026-08-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Toda comunicación y todo cobro salen **a título de la empresa cliente (tenant)**, no de la plataforma. Hoy Twilio, SendGrid, Vapi y los gateways de pago usan credenciales globales de `.env`; lo único por tenant es `settings.whatsappFromNumber`. Al terminar esta fase, cada tenant tiene su propia identidad de envío (WhatsApp, teléfono, correo) y su propio método de cobro, y la plataforma solo orquesta.

**Alcance: backend y frontend.** Incluye la sección `Settings > Integraciones` del dashboard con las cuatro pantallas (conexión de canales con Embedded Signup, configuración de cobro, identidad de marca, y estado/salud de integraciones).

**Fuera de alcance:** SMS (sigue deshabilitado por flag, con Bird), dLocal Go, y el wizard de onboarding obligatorio al crear el tenant.

</domain>

<decisions>
## Implementation Decisions

### Modelo de cuentas por canal (decidido tras investigación, corrige el planteamiento inicial)

- **D-01:** Modelo **híbrido: managed por defecto, BYO opcional**. Por defecto la plataforma crea la infraestructura del tenant vía API (subcuenta de Twilio, subuser de SendGrid); un tenant que ya tiene su propio proveedor puede traer sus credenciales. El adaptador resuelve credenciales igual en ambos modos — la diferencia es solo de aprovisionamiento, no de camino de envío.
- **D-02:** **Twilio (WhatsApp + voz) = del tenant**, vía el programa **Tech Provider (ISV)** de Twilio. El tenant hace Embedded Signup, lo que crea **su propio WABA bajo su Meta Business**; la plataforma crea una subcuenta de Twilio para él y conecta el WABA vía Senders API. Twilio permite un solo WABA por cuenta → una subcuenta por tenant, obligatorio.
- **D-03:** **SendGrid = del tenant**, vía **subusers** creados por API con su propia API key. Para que el correo salga del dominio del tenant, el tenant debe publicar los CNAME de autenticación en su DNS — no hay forma de evitarlo, es lo que firma el correo a su nombre.
- **D-04:** **Vapi = de la plataforma.** Sigue con credencial global (`VAPI_API_KEY`, `VAPI_AGENT_ID`) como hoy. No es BYO y no se guarda credencial de Vapi por tenant.
- **D-05:** La llamada sale del número del tenant **importando su número de Twilio a nuestra cuenta Vapi vía API** al guardar/aprovisionar sus credenciales, y persistiendo el `vapiPhoneNumberId` resultante por tenant. El tenant nunca toca Vapi.
- **D-06:** **Gateway de pago = BYO obligatorio, sin excepción.** No existe modelo managed: Stripe lista "debt collection agencies" en negocios prohibidos y Colombia no está soportada para cuentas conectadas de Connect; Mercado Pago prohíbe explícitamente terceros que procesen pagos de compañías de cobranza. Nunca centralizar dinero bajo la cuenta de la plataforma.
- **D-07:** **Riesgo aceptado conscientemente:** bajo el modelo ISV el titular de la cuenta ante Twilio es la plataforma, y Twilio documenta que tráfico no conforme de un cliente puede suspender la cuenta entera. La AUP de Twilio prohíbe *third-party* debt collection; el tenant cobrando deuda propia es cobranza de primera parte y no cae ahí, pero el escrutinio apunta a la plataforma. El modo BYO existe como válvula de escape para tenants de alto volumen o alto riesgo.

### Almacenamiento y cifrado de credenciales

- **D-08:** Modelo nuevo **`TenantIntegration`**: `tenantId` + `provider` + config pública (número, dominio, `vapiPhoneNumberId`, sender) + **secretos cifrados con AES-256-GCM**, master key en env, con `keyVersion` para rotar. No se guardan en `Tenant.settings`, que ya se serializa al perfil del tenant en `tenant-profile.dto.ts` y se consulta con SQL cruda en el handler de webhook.
- **D-09:** `unique(tenantId, provider)` — **un juego de credenciales por canal por tenant**. Sin variantes por entorno ni múltiples senders.
- **D-10:** El modelo distingue `mode: managed | byo`. En `managed` los secretos son los de la subcuenta/subuser que creó la plataforma; en `byo` son los que pegó el tenant. Se guardan y se resuelven idénticamente.
- **D-11:** **Verificación síncrona al guardar**: health check contra el proveedor y persistir `status: verified | failed` + `verifiedAt`. El tenant se entera en el momento, no cuando ya hay deudores en cola.

### Modelo de gateway de pago

- **D-12:** **Separar `provider` de `method`.** El enum `PaymentGateway` actual mezcla método (`pix`, `spei`, `pse`, `card`, `cash`) con proveedor (`mercadopago`, `conekta`). Nuevo `provider`: `stripe`, `wompi`, `payu`, `epayco`, `mercadopago`, `external_link`, `transfer`; `method` opcional para el medio. Requiere migración de datos de `payment_links` existentes.
- **D-13:** **Enlace externo = plantilla con variables.** El tenant guarda una URL con placeholders (`{monto}`, `{ref}`, `{nombre}`) que se sustituyen por deuda. Da trazabilidad por referencia sin integrar nada y cubre Bold, Nequi, links de Wompi, checkout de PayU, etc.
- **D-14:** Sin webhook (enlace externo, transferencia), la conciliación es **manual en el dashboard, más `promise_to_pay` automático** cuando el deudor dice que ya pagó — queda pendiente de confirmación, no marca la deuda como pagada.
- **D-15:** `conekta` se deprecia (México, sin uso en Colombia).

### Comportamiento sin credenciales

- **D-16:** Razón nueva **`channel_not_configured`** en `ComplianceService`. El canal se marca no elegible, el workflow intenta el siguiente canal que sí esté configurado, y si no queda ninguno **escala a humano**. Reutiliza el gate que ya es el único choke point real; no se crea un camino paralelo.
- **D-17:** El **modo simulado sobrevive solo bajo flag explícito** y el arranque **falla si el flag está encendido con `NODE_ENV=production`**. Los envíos simulados se marcan como tales en BD para no inflar métricas de entrega ni consumir el cupo de compliance de la Ley 1266. Hoy los cinco adaptadores (WA, email, voz, SMS, gateways) devuelven `status: "sent"` sin enviar nada cuando falta credencial — bajo BYO eso sería un envío fantasma en producción.
- **D-18:** **Corte con migración que siembra las globales**: una migración de datos idempotente copia las credenciales globales actuales como `TenantIntegration` de los tenants existentes, para que nadie se caiga; los tenants nuevos arrancan vacíos. Sigue el patrón de datos de referencia vía migración que ya usa el repo.

### Ruteo y firma de webhooks

- **D-19:** **URL por integración con token opaco aleatorio** (`/webhooks/{proveedor}/{token}`), que el tenant o el aprovisionamiento pega en la consola del proveedor. Permite cargar el secreto **antes** de validar la firma y no expone ni permite adivinar el `tenantId`.
- **D-20:** **Fail closed:** si no hay secreto de firma configurado para ese tenant, el webhook se rechaza con 401 y queda en audit log. Un webhook de pago sin validar es un vector para marcar deudas como pagadas desde fuera.
- **D-21:** El webhook de **Vapi sigue siendo un endpoint compartido** (la cuenta es de la plataforma); el tenant se resuelve por el contact record como hoy, sin token por integración.
- **D-22:** El reply del email bidireccional usa **siempre el dominio del tenant**. Sin MX/CNAME configurado no hay email bidireccional, solo salida — se elimina el `reply@reply.fogging.org` fijo actual.

### Frontend

- **D-23:** La configuración vive en **`Settings > Integraciones`** del dashboard existente, accesible siempre — no en un wizard de onboarding obligatorio. El tenant puede rotar credenciales o cambiar de gateway cuando quiera. Se suma a las secciones de settings que ya existen (`templates`, `automation`).
- **D-24:** **Cuatro pantallas, todas en esta fase:**
  1. *Conexión de canales* — botón de Embedded Signup de WhatsApp con el SDK de Meta (Facebook Login for Business), conexión de teléfono y correo, estado de verificación por canal, e instrucciones de CNAME para el dominio de email.
  2. *Configuración de cobro* — selector de proveedor (Stripe, Wompi, PayU, ePayco, Mercado Pago, enlace externo), captura de llaves con campos **write-only**, y editor de plantilla de enlace con `{monto}`/`{ref}`.
  3. *Identidad de marca* — nombre comercial, logo, firma legal y datos de contacto, **con vista previa de cómo le llega el mensaje al deudor**.
  4. *Estado y salud de integraciones* — qué canales están operativos, cuáles fallaron la verificación, y **qué deudas se quedaron sin contactar por falta de configuración** (alimentado por `channel_not_configured`, D-16).
- **D-25:** El flujo de navegador de **Embedded Signup** entra aquí: carga del SDK de Meta, Facebook Login for Business, y entrega del token al endpoint de backend que crea la subcuenta de Twilio y registra el sender. Ya no queda para una fase posterior.
- **D-26:** Los campos de secreto son **write-only en la UI**: nunca se muestran en claro, solo los últimos 4 caracteres y el estado de verificación (coherente con la restricción de la API).

### Claude's Discretion

- Modelo e inyección de la **identidad de marca** (nombre comercial, logo, firma legal, datos de contacto) en `variables.empresa` de las plantillas, en los prompts del agente LLM y en `strategy_context.variables` de Vapi. Hoy `variables.empresa` ya existe pero cae a `"su gestor de cobranza"` porque nadie la llena desde el tenant.
- **API write-only** de credenciales restringida a rol admin/owner del tenant: nunca devuelve el secreto en claro, solo los últimos 4 caracteres y el estado de verificación.
- **Resolución de credenciales por request con caché corta** (LRU/TTL) en lugar del constructor, que es como funcionan hoy los tres adaptadores.
- Una ruta de webhook por proveedor bajo un controlador común, siguiendo el patrón de `twilio-wa-webhook.handler.ts`.
- Gestión de la master key de cifrado (variable de entorno, `keyVersion` en la fila para rotación sin downtime).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planificación
- `.planning/ROADMAP.md` §Phase 8 — alcance, decisiones e investigación de gateways
- `.planning/STATE.md` — decisiones de arquitectura acumuladas, en especial los dos carriles de `ComplianceService` (2026-07-23)

### Adaptadores de canal (el corazón del refactor)
- `apps/service-notifications/src/adapters/twilio-whatsapp.adapter.ts` — cliente Twilio construido en el constructor; `resolveFrom()` ya lee `settings.whatsappFromNumber`; rama de simulación en L50-55
- `apps/service-notifications/src/adapters/email.adapter.ts` — `SENDGRID_API_KEY` leída por envío; `reply_to` condicional (SendGrid v3 rechaza `reply_to: undefined`)
- `apps/service-notifications/src/adapters/vapi-voice.adapter.ts` — `apiKey`/`agentId`/`phoneNumberId` cacheados en el constructor
- `apps/service-notifications/src/contacts/contacts.service.ts` — orquestador que llama los adaptadores; su firma no debe romperse

### Webhooks entrantes
- `apps/service-notifications/src/webhooks/twilio-wa-webhook.handler.ts` — resuelve tenant por `To` = `settings.whatsappFromNumber` con SQL cruda (L126-135)
- `apps/service-payments/src/webhooks/webhook-validator.service.ts` — valida con `CONEKTA_WEBHOOK_SECRET` / `MP_WEBHOOK_SECRET` globales
- `apps/service-notifications/src/webhooks/` — patrón del handler de SendGrid Inbound Parse (Phase 6)

### Pagos
- `apps/service-payments/src/gateways/gateway.service.ts` — `createCheckout` con llaves desde `ConfigService`; ramas de checkout simulado
- `apps/service-payments/src/payments/payments.service.ts` — `PAYMENT_LINK_BASE_URL` global
- `packages/db/prisma/schema.prisma` — `enum PaymentGateway` (L153), `model PaymentLink` (L553), `model Tenant` (L254)

### Frontend (dashboard)
- `apps/web/app/(dashboard)/settings/page.tsx` — sección de settings donde cuelga `Integraciones`
- `apps/web/components/settings/OrganizationSettingsPanel.tsx` — panel de organización; patrón de formulario de settings a replicar
- `apps/web/components/settings/ContactRetryPolicyPanel.tsx` — patrón de panel que persiste contra `Tenant.settings`
- `apps/web/app/pay/[token]/` — página pública de pago; consume el enlace que genera el gateway
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview — flujo de navegador de Embedded Signup

### Configuración de tenant y compliance
- `apps/api-gateway/src/tenant/tenant.service.ts` — merge parcial de `settings`, normalización y unicidad de `whatsappFromNumber`
- `apps/api-gateway/src/tenant/dto/tenant-profile.dto.ts` — expone `settings` al perfil; razón por la que los secretos no van ahí
- `packages/compliance/` — `checkContact` / `checkBeforeSend` / `isChannelEligible`, donde entra `channel_not_configured`

### Documentación externa de proveedores
- https://www.twilio.com/docs/whatsapp/isv/tech-provider-program — programa ISV, Embedded Signup, un WABA por cuenta
- https://www.twilio.com/docs/whatsapp/isv/register-senders — Senders API para conectar el WABA del tenant a su subcuenta
- https://www.twilio.com/en-us/legal/aup — prohibición de third-party debt collection
- https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication/associate-an-authenticated-domain-with-a-subuser — dominios autenticados por subuser

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `variables.empresa` ya existe en `renderBody()` del adaptador de WhatsApp, con fallback `"su gestor de cobranza"` — es el punto de entrada natural de la identidad de marca, solo falta llenarlo desde el tenant.
- `resolveFrom(tenantId)` en `twilio-whatsapp.adapter.ts` es el patrón exacto de resolución por tenant a generalizar a credenciales completas.
- La resolución de tenant por número en `twilio-wa-webhook.handler.ts` ya existe; hay que reemplazarla por el token opaco sin romper los envíos en vuelo.
- `PaymentLink` ya tiene `tenantId`, `token` único y `gateway` — la base para `provider` + `method`.

### Established Patterns
- Los tres adaptadores leen `ConfigService` en el **constructor** y cachean el cliente. Ese es el patrón a romper: la credencial pasa a ser por request.
- Cuando falta credencial, todos los adaptadores simulan y devuelven éxito. Ese patrón debe morir en producción (D-17).
- Datos de referencia y lookup se cargan con **migración de datos idempotente**, no con seed script — aplica al sembrado de credenciales globales (D-18).
- Los comentarios de código van en inglés aunque el repo tenga texto en español; solo prompts y plantillas quedan en español.

### Integration Points
- **No existe ninguna utilidad de cifrado en el repo** (cero hits de `createCipheriv`/`encrypt` en `packages/` y `apps/`). El cifrado de credenciales es terreno virgen y probablemente merece vivir en `packages/utils` o `packages/shared`.
- `ComplianceService` es el único choke point válido de envío; `channel_not_configured` entra ahí y no en los adaptadores.
- Kafka: los eventos por canal ya existen; el aprovisionamiento de subcuentas no debería inventar topics nuevos sin necesidad.

</code_context>

<specifics>
## Specific Ideas

- El usuario pidió explícitamente **Stripe** entre los gateways pese a que no procesa PSE ni wallets locales colombianos — queda como opción para tenants con entidad en EE. UU.
- La investigación de gateways LLC-friendly (dLocal Go, EBANX, Nuvei, Rapyd) se hizo y se descartó para esta fase: con BYO puro en pagos, el tenant colombiano usa Wompi/PayU/ePayco/Mercado Pago con su NIT. Queda documentada en ROADMAP.md §Phase 8 por si cambia el modelo.
- El usuario pidió expresamente reducir al mínimo lo que el tenant tiene que configurar — de ahí el modelo managed por defecto. Lo irreducible: Embedded Signup + verificación de Meta para WhatsApp, CNAME en DNS para email, y su gateway de pago.

</specifics>

<deferred>
## Deferred Ideas

- **Wizard de onboarding obligatorio** al crear el tenant, que lo fuerce a conectar canales antes de operar — mejora la activación pero es bastante más UI; la sección de settings cubre el caso base.
- **SMS a nombre del tenant** vía el Twilio del tenant, retirando Bird — hoy el canal está deshabilitado por flag y sin proveedor CO resuelto.
- **dLocal Go / EBANX como gateway LLC-friendly con PSE** — solo tendría sentido si el modelo de pagos deja de ser BYO puro, cosa que hoy la política de las plataformas impide.
- **Convenio de recaudo bancario** (Bancolombia/Davivienda) como vía real de recaudo centralizado — requiere SAS colombiana, no es un problema de software.

</deferred>

---

*Phase: 8-Configuración por Tenant (BYO): canales e identidad de cobro*
*Context gathered: 2026-08-04*
