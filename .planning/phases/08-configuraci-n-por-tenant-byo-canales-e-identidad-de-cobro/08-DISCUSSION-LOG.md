# Phase 8: Configuración por Tenant (BYO): canales e identidad de cobro - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-04
**Phase:** 8-Configuración por Tenant (BYO): canales e identidad de cobro
**Areas discussed:** Titular del cobro, Gateways a implementar, Canales BYO, Almacenamiento y cifrado de credenciales, Modelo de gateway de pago, Comportamiento sin credenciales, Ruteo y firma de webhooks, Modelo de cuentas (managed vs BYO), Alcance de frontend

---

## Titular del cobro (previo a la creación de la fase)

| Option | Description | Selected |
|--------|-------------|----------|
| BYO tenant + fallback LLC | Tenant conecta su gateway; si no tiene, cae al de plataforma con nuestro LLC | |
| 100% BYO tenant | Sin gateway de plataforma; sin credenciales solo transferencia manual | ✓ |
| Solo plataforma (LLC) | Todos cobran por nuestra cuenta y luego liquidamos | |

**User's choice:** 100% BYO tenant
**Notes:** Coherente con el hallazgo previo de que Stripe y Mercado Pago prohíben la cobranza de terceros. Se mantuvo firme durante toda la discusión, incluso al abrirse el modelo managed para comunicaciones.

---

## Gateways a implementar

| Option | Description | Selected |
|--------|-------------|----------|
| dLocal Go | LLC-friendly, PSE + tarjetas CO, self-serve | |
| Stripe | Pedido explícitamente; solo tarjetas internacionales | ✓ |
| Enlace externo estático | El tenant pega su propio link o plantilla | ✓ |
| Wompi (Bancolombia) | El más usado por tenants colombianos; exige NIT + cuenta Bancolombia | ✓ |

**User's choice:** Stripe, Wompi, enlace externo — y añadió por texto libre "también las que no funcionan sin LLC, como wompi, payu, epayco, mercado pago"
**Notes:** dLocal Go no se seleccionó. Con BYO puro pierde sentido, pero la investigación queda documentada en ROADMAP.md por si el modelo cambia.

---

## Canales BYO (primera pasada)

| Option | Description | Selected |
|--------|-------------|----------|
| WhatsApp (Twilio subaccount) | SID/token + número WA del tenant | ✓ |
| Email (SendGrid / dominio propio) | API key y dominio autenticado del tenant | ✓ |
| Voz (Vapi) | API key + assistant/phone del tenant | ✓ |
| Identidad de marca | Nombre, logo, firma legal en plantillas y prompts | ✓ |

**User's choice:** los cuatro
**Notes:** **Corregido más adelante.** El usuario aclaró que "lo que es Vapi lo manejamos nosotros, solo los temas individuales como correo (trae su correo de SendGrid), teléfono de Twilio, WhatsApp de Facebook para usar con Twilio". Vapi salió de BYO y quedó como credencial global de plataforma.

---

## Almacenamiento y cifrado de credenciales

| Option | Description | Selected |
|--------|-------------|----------|
| Tabla TenantIntegration cifrada | Config pública + secretos AES-256-GCM con keyVersion | ✓ |
| Dentro de Tenant.settings | Sin migraciones nuevas, pero settings se expone al perfil | |
| Secret manager externo | Más seguro y auditable; dependencia y coste operativo nuevos | |

| Option | Description | Selected |
|--------|-------------|----------|
| Verificar al guardar (síncrono) | Health check y estado verified/failed + verifiedAt | ✓ |
| Verificar asíncrono | Job posterior; ventana donde el canal parece listo sin estarlo | |
| No verificar | El error aparece en el primer envío real | |

| Option | Description | Selected |
|--------|-------------|----------|
| Uno por canal | unique(tenantId, provider) | ✓ |
| Uno por canal + entorno | Sandbox y producción en paralelo | |
| Varios por canal | Selección por portafolio/campaña | |

**User's choice:** TenantIntegration cifrada, verificación síncrona, uno por canal
**Notes:** Pesó que `settings` ya se serializa en `tenant-profile.dto.ts` y se consulta con SQL cruda en el handler de webhook — un descuido filtraría secretos.

---

## Modelo de gateway de pago

| Option | Description | Selected |
|--------|-------------|----------|
| Separar provider + method | Deja de mezclar medio y proveedor; requiere migrar payment_links | ✓ |
| Solo agregar valores al enum | Migración trivial, mantiene la ambigüedad de `pse` | |
| Provider nuevo, method después | Deuda técnica visible, menos riesgo inmediato | |

| Option | Description | Selected |
|--------|-------------|----------|
| Plantilla con variables | URL con {monto}, {ref}, {nombre} sustituidos por deuda | ✓ |
| URL fija sin variables | El deudor teclea el monto; sin conciliación | |
| Ambas según tenga placeholders | Cubre los dos casos con una configuración | |

| Option | Description | Selected |
|--------|-------------|----------|
| Registro manual en el dashboard | Honesto sobre lo que se puede saber sin integración | |
| Manual + promesa de pago automática | El agente marca promise_to_pay cuando el deudor dice que pagó | ✓ |
| Fuera de alcance en esta fase | Conciliación manual como está hoy | |

**User's choice:** separar provider + method, plantilla con variables, manual + promesa automática
**Notes:** Se advirtió el riesgo de que la promesa automática pause cobranza por un pago que nunca llegó; el usuario lo aceptó — queda pendiente de confirmación, no marca la deuda como pagada.

---

## Comportamiento sin credenciales

| Option | Description | Selected |
|--------|-------------|----------|
| Canal no elegible → siguiente canal | Razón channel_not_configured en compliance; escala a humano si no queda ninguno | ✓ |
| Error duro | Consume intentos del retry policy y ensucia métricas | |
| Queda en cola hasta que configuren | Nada se pierde, pero deudas urgentes se callan | |

| Option | Description | Selected |
|--------|-------------|----------|
| Flag explícito, bloqueado en prod | Sobrevive para dev/tests; falla el arranque en producción | ✓ |
| Eliminarlo por completo | Cero riesgo, obliga a mocks o credenciales reales en local | |
| Dejarlo como está | Escenario de envío fantasma en producción | |

| Option | Description | Selected |
|--------|-------------|----------|
| Migración que siembra las globales | Nadie se cae; tenants nuevos arrancan vacíos | ✓ |
| Corte duro | Más limpio, viable solo sin tenants en producción | |
| Flag por tenant | Corte gradual, dos caminos vivos en el código | |

**User's choice:** channel_not_configured, sandbox tras flag bloqueado en prod, migración que siembra
**Notes:** El usuario pidió explicación del "envío simulado" antes de confirmar. Se le mostró que los cinco adaptadores (WA, email, voz, SMS, gateways) devuelven `status: "sent"` sin enviar nada cuando falta credencial, y que bajo BYO eso significa deudas muertas en silencio, cupo de compliance consumido y links de pago falsos. Con eso claro, ratificó la decisión.

---

## Ruteo y firma de webhooks

| Option | Description | Selected |
|--------|-------------|----------|
| URL por integración con token opaco | Permite cargar el secreto antes de validar la firma | ✓ |
| Endpoint compartido, resolver por payload | Obliga a parsear antes de validar; identificador distinto por proveedor | |
| Híbrido | Migración suave, dos caminos que mantener | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rechazar (fail closed) | 401 y audit log; evita marcar deudas pagadas desde fuera | ✓ |
| Aceptar y marcar como no verificado | No se pierden eventos, se confía en datos sin firmar | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dominio del tenant con fallback al nuestro | No rompe el lazo si falta el DNS | |
| Siempre el dominio del tenant | Sin MX no hay email bidireccional, solo salida | ✓ |
| Seguir con el dominio compartido | Cero fricción DNS, pero el deudor ve un dominio ajeno | |

**User's choice:** token opaco, fail closed, siempre el dominio del tenant
**Notes:** La opción estricta de email es coherente con el objetivo de la fase: eliminar cualquier rastro de la plataforma en la conversación con el deudor.

---

## Modelo de cuentas (managed vs BYO) — planteado por el usuario

El usuario preguntó si se puede tener "una cuenta muy grande" con varios tenants dentro, para que no tenga que configurar nada pero quede a su nombre. Se investigó y se encontró que sí existe, vía cuentas hijas.

| Option | Description | Selected |
|--------|-------------|----------|
| Híbrido: managed por defecto, BYO opcional | Subcuenta Twilio + subuser SendGrid por API; el tenant solo hace Embedded Signup y CNAME | ✓ |
| Solo managed (ISV) | Alta más simple, concentra todo el riesgo de suspensión | |
| Solo BYO | Máxima fricción, riesgo aislado por tenant | |

| Option | Description | Selected |
|--------|-------------|----------|
| Backend ahora, UI en otra fase | Endpoints de intercambio de token y creación de subcuenta | ✓ |
| Solo alta manual por ahora | Trabajo manual en cada alta de tenant | |
| WhatsApp managed fuera de esta fase | Reduce alcance, deja el canal principal con más fricción | |

**User's choice:** híbrido, y backend primero
**Notes:** La segunda decisión quedó superada minutos después, cuando el usuario pidió "hagamos front también" — la UI de Embedded Signup entró al alcance. Se le advirtieron dos costos del modelo ISV antes de decidir: (1) la AUP de Twilio prohíbe *third-party* debt collection y bajo ISV el titular de la cuenta es la plataforma; (2) Twilio puede suspender la cuenta entera por tráfico no conforme de un solo cliente. También se señaló que esto matiza la conclusión previa del proyecto de "nunca centralizar mensajería": lo que se centraliza es el árbol de facturación, no la identidad — el WABA sigue siendo del tenant. Lo del dinero se mantuvo sin matices.

---

## Alcance de frontend

| Option | Description | Selected |
|--------|-------------|----------|
| Conexión de canales + Embedded Signup | SDK de Meta, estado de verificación, instrucciones de CNAME | ✓ |
| Configuración de cobro | Selector de proveedor, llaves write-only, editor de plantilla de enlace | ✓ |
| Identidad de marca | Nombre, logo, firma legal, con vista previa del mensaje | ✓ |
| Estado y salud de integraciones | Canales operativos, fallos de verificación, deudas no contactadas | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Sección Settings > Integraciones | Accesible siempre, consistente con el resto de la app | ✓ |
| Wizard de onboarding + Settings | Mejor activación, bastante más UI | |
| Solo wizard de onboarding | Rotar credenciales se vuelve incómodo | |

**User's choice:** las cuatro pantallas, en Settings > Integraciones
**Notes:** Llegó a mitad de la escritura del CONTEXT.md ("hagamos front también"), así que el alcance de la fase pasó de solo-backend a full-stack y hubo que reescribir el boundary y el ROADMAP.

---

## Claude's Discretion

- Modelo e inyección de la identidad de marca en `variables.empresa`, prompts del agente LLM y `strategy_context.variables` de Vapi.
- API write-only de credenciales restringida a admin/owner; nunca devuelve el secreto en claro.
- Resolución de credenciales por request con caché corta, en lugar del constructor.
- Una ruta de webhook por proveedor bajo un controlador común.
- Gestión de la master key de cifrado y rotación vía `keyVersion`.

## Deferred Ideas

- Wizard de onboarding obligatorio al crear el tenant.
- SMS a nombre del tenant vía su Twilio, retirando Bird.
- dLocal Go / EBANX como gateway LLC-friendly con PSE, si el modelo de pagos deja de ser BYO puro.
- Convenio de recaudo bancario (Bancolombia/Davivienda) para recaudo centralizado — requiere SAS colombiana.
