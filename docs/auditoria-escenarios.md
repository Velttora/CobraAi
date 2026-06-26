# Auditoría código-vs-documento — Escenarios CobraAI (SCN-01…SCN-14)

> Audita el documento de 14 escenarios contra el código real del monorepo.
> Generada el 2026-06-25. Las rutas son enlaces clicables al código real.

## ✅ Estado de correcciones (2026-06-25)

Se priorizaron por caso de uso (no por nombres). Arreglados en orden #2 → #3 → #1:

| # | Caso de uso | Estado | Cambios clave |
|---|---|---|---|
| 2 | Pagar cierra la promesa (no se marca "rota") | **ARREGLADO** | El pago marca las promesas `kept`/`partial`; el job de vencidas excluye deudas `paid_full`/`written_off`. [promises.ts](../packages/utils/src/promises.ts), [payment-events.service.ts](../apps/service-portfolios/src/debts/payment-events.service.ts) |
| 3 | Planes de pago en cuotas | **ARREGLADO** | Modelo `PaymentPlan` + cuotas como `PromiseToPay`; alta por texto y voz; cierre del plan al pagar todas. [payment-plan.service.ts](../apps/service-notifications/src/agent/payment-plan.service.ts), [migración](../packages/db/prisma/migrations/20260625200000_payment_plans/migration.sql) |
| 1 | Recordatorio pre-vencimiento | **ARREGLADO** | Campo de condición `days_to_due` (con signo) + gate `ruleAppliesToDebt`; deudas `upcoming` entran al scheduler; regla -7d en los 3 paquetes. [rule-engine.service.ts](../apps/service-workflows/src/rule-engine/rule-engine.service.ts) |

**Pendiente operativo:** aplicar la migración (`db:migrate`); re-aplicar paquetes en tenants existentes para que reciban la regla pre-vencimiento; el asistente Vapi debe emitir `installments_count`/`interval_days` para planes por voz.

El resto de los hallazgos abajo refleja el estado **previo** al arreglo (se anota *(arreglado)* donde aplica).

## TL;DR — los 10 hallazgos que importan

1. **El archivo `packages/utils/src/rule-evaluator.ts` no existe.** La lógica de scoring vive en [scoring-engine.ts](../packages/utils/src/scoring-engine.ts). Todo el documento apunta a un archivo equivocado.
2. **Los triggers `pre_due` / `on_due` / `post_due` con `trigger_days` NO existen.** El enum real de triggers es `debt_created, debt_updated, score_updated, promise_broken, payment_confirmed, schedule, manual` ([schema.prisma](../packages/db/prisma/schema.prisma)). Las reglas programadas usan `trigger: "schedule"` + condiciones sobre `aging_days`, `status`, `ai_score`, etc.
3. **No hay recordatorio pre-vencimiento posible.** ~~`aging_days` se calcula como `max(0, hoy - due_date)`, así que nunca es negativo.~~ **✅ Arreglado:** nuevo campo `days_to_due` (con signo) y gate `ruleAppliesToDebt` que deja que las deudas `upcoming` reciban solo reglas pre-vencimiento ([rule-engine.service.ts](../apps/service-workflows/src/rule-engine/rule-engine.service.ts)).
4. **`priority_score` es relativo al portafolio y NO se puede calcular para una deuda aislada.** Depende de `amount / max_amount_in_portfolio` ([scoring-engine.ts:85-97](../packages/utils/src/scoring-engine.ts#L85-L97)). Todos los `priority_score` ilustrativos del documento son irreproducibles sin el portafolio completo. Mis recálculos asumiendo "1 deuda = todo el portafolio" dan cotas superiores muy infladas.
5. **`recovery_score` real corre sistemáticamente MÁS ALTO que el ilustrativo** (ver tabla). El componente `responseHistoryScore` es generoso (55 neutro, −12 por contacto) y `agingRecoveryScore` solo baja 0.5/día.
6. **Las promesas nunca se marcaban `kept`.** ~~El job de promesas vencidas marcaba `broken` toda promesa `pending` vencida sin mirar el estado de la deuda → una deuda pagada puntual quedaba como promesa rota.~~ **✅ Arreglado:** el pago marca `kept`/`partial` y el job excluye deudas `paid_full`/`written_off` ([promises.ts](../packages/utils/src/promises.ts), [payment-events.service.ts](../apps/service-portfolios/src/debts/payment-events.service.ts)).
7. **El segmento `critical` NO bloquea el contacto automático por sí mismo.** La exclusión real es por *estado* (`legal_risk`/`legal`/`disputed` quedan fuera de `evaluateTenant`, que solo procesa `active`/`contacted`). Un deudor segmentado `critical` pero aún en estado `active` **puede ser contactado**. SCN-06 asume una garantía que el código no da por segmento.
8. **`PaymentPlan` ahora existe** (faltan aún `LegalEscalation`, `DisputeCase`). ~~SCN-05 no tenía soporte: el intent `plan_request` no hacía nada.~~ **✅ Arreglado:** modelo `PaymentPlan` + cuotas como `PromiseToPay`, alta de plan por texto y voz ([payment-plan.service.ts](../apps/service-notifications/src/agent/payment-plan.service.ts)).
9. **SCN-09 (disputa) SÍ está implementado** — contradice el documento, que lo marca como gap. El agente clasifica intent `dispute`, pone `status: "disputed"` y publica `cobrai.debt.disputed` ([conversation-agent.service.ts:260-269](../apps/service-notifications/src/agent/conversation-agent.service.ts#L260-L269)).
10. **El compliance es robusto y precede al contacto**, pero el bypass NO está garantizado por test y la ruta de workflows usa `isChannelEligible` (sin horario/frecuencia), no `checkContact`. SCN-12 requiere verificación de que ninguna ruta de contacto salte horario/frecuencia.

---

## Mapa de la realidad del código

| Concepto del doc | Realidad en el código |
|---|---|
| `packages/utils/src/rule-evaluator.ts` | No existe → [scoring-engine.ts](../packages/utils/src/scoring-engine.ts) |
| Triggers `pre_due/on_due/post_due` + `trigger_days` | No existen. Trigger `schedule` + `condition` sobre `aging_days`/`status`/`ai_score`/`ai_segment`/`aging_bucket`/`amount_outstanding`/`whatsapp_opt_in` |
| Segmentos `Crítico/Alto/Medio/Bajo/Mínimo` | `critical/high/medium/low/minimal` (inglés) — [scoring-engine.ts:109-124](../packages/utils/src/scoring-engine.ts#L109-L124) |
| `PaymentPromise` | `PromiseToPay` (pago único) |
| `PaymentPlan` (cuotas) | **No existe** |
| `LegalEscalation` | **No existe** — escalamiento = cambio de estado + `WorkflowExecution` + evento |
| `DisputeCase` | **No existe** — disputa = estado `disputed` + evento |
| `PromiseExpirationChecker` (job) | Existe inline en [workflows.service.ts:593-609](../apps/service-workflows/src/workflows/workflows.service.ts#L593-L609) |
| `ComplianceGuard` | [ComplianceService](../packages/compliance/src/compliance.service.ts) — robusto |
| Job de recálculo periódico de scores | Sí: `refreshPriorityScoresForTenant` cada ciclo (cron `0 */2 * * *`) — [workflows.service.ts:1012-1073](../apps/service-workflows/src/workflows/workflows.service.ts#L1012-L1073), [scheduler.service.ts](../apps/service-workflows/src/scheduler/scheduler.service.ts) |

### Topics Kafka — doc vs reales

Reales (encontrados en código): `cobrai.contact.requested`, `cobrai.contact.completed`, `cobrai.contact.failed`, `cobrai.whatsapp.send_requested`, `cobrai.whatsapp.message_received`, `cobrai.email.message_received`, `cobrai.voice.call_requested`, `cobrai.voice.call_completed`, `cobrai.payment.confirmed`, `cobrai.payment_link.delivery_failed`, `cobrai.debt.created`, `cobrai.debt.updated`, `cobrai.debt.status_changed`, `cobrai.debt.segmented`, `cobrai.debt.disputed`, `cobrai.debt.escalated`, `cobrai.debt.promise_registered`, `cobrai.debtor.contact_queue`, `cobrai.escalation.requested`, `cobrai.portfolio.imported`.

| Evento que el doc asume | Estado real |
|---|---|
| `cobrai.promise.created` | → es `cobrai.debt.promise_registered` |
| `cobrai.promise.kept` | **No existe** (y la lógica de "kept" no existe) |
| `cobrai.promise.broken` | **No existe** como topic; la transición sí ocurre vía `evaluateTriggerRules(...,"promise_broken")` interno |
| `cobrai.debt.escalated_legal` | → es `cobrai.debt.escalated` (con `target`) |
| `cobrai.debt.score_recalculated` | **No existe** (el recálculo persiste pero no se publica) |
| `cobrai.payment_plan.created` | **No existe** |
| `cobrai.debt.no_channel_available` | **No existe** → se publica `cobrai.contact.failed.no_response` con `reason:"no_available_channel"` |
| `cobrai.compliance.blocked` | **No existe** → bloqueo se registra como `WorkflowExecution status:"skipped"` y/o `Contact status:"scheduled"` |
| `cobrai.debt.amount_updated` | **No existe** (verificar en service-payments/portfolios) |

---

## Recálculo de scores (formulas reales)

`recovery_score` es comparable directamente (independiente del portafolio salvo el bucket de monto). `priority_score`/segmento aquí asumen **portafolio de 1 deuda** (cota superior — irreales; en un portafolio real con montos mayores, priority baja mucho).

| SCN | rec doc | **rec real** | pri doc | pri real* | seg doc | seg real* | best_channel |
|---|---|---|---|---|---|---|---|
| 01 | 89 | **84** | 27 | 84* | low | high* | whatsapp |
| 02 d0 | 75 | **91** | 45 | 59* | medium | medium* | whatsapp |
| 02 d14 | 68 | **89** | 63 | 72* | medium | high* | whatsapp |
| 03 | 58 | **76** | 78 | 57* | high | medium* | voice |
| 04 | 65 | **76** | 71 | 50* | high | medium* | whatsapp |
| 05 | 60 | **79** | 81 | 56* | high | medium* | voice |
| 06 | 22 | **12** | N/A | 12* | critical | **critical ✓** | (sin canal) |
| 07 | 65 | 80 | 50 | — | — | — | **voice ✓** |
| 08 | — | — | 55 | — | — | — | **null ✓** |

`*` = priority/segmento con portafolio de 1 deuda (no reproducible al valor del doc). **Conclusión:** los `recovery_score` reales no coinciden con los ilustrativos (corren más alto); los `priority_score` no son verificables sin contexto de portafolio. Lo que **sí** se reproduce exactamente es el waterfall de canal de SCN-07 (→voz por fallback) y SCN-08 (→sin canal), y la condición de `critical` de SCN-06 (aging 195 > 180).

---

## Escenario por escenario

### SCN-01 — Recordatorio pre-vencimiento
- ✅ **Arreglado.** No por triggers `pre_due`, sino por condición `days_to_due` en una regla `schedule`: las 3 plantillas de paquete traen "Pre-vencimiento -7d" (`days_to_due` entre 1 y 7). Las deudas `upcoming` ahora entran al scheduler con el gate `ruleAppliesToDebt`.
- ✅ Idempotencia: `WorkflowExecution` evita doble disparo el mismo día ([getQueue](../apps/service-workflows/src/workflows/workflows.service.ts#L231-L249)).
- ⚠️ Canal "whatsapp" requiere opt-in **y teléfono** ([scoring-engine.ts:141-143](../packages/utils/src/scoring-engine.ts#L141-L143)); el doc solo menciona opt-in.
- ✅ Pago confirmado → estado terminal vía `handlePaymentConfirmed` → no más reglas (las reglas excluyen estados terminales).

### SCN-02 — Sin respuesta → motor dinámico
- ✅ **El recálculo periódico de `priority_score` existe** (gran duda del doc resuelta): `refreshPriorityScoresForTenant` corre cada ciclo del cron de 2h y **persiste** `priorityScore`, `aiSegment`, `bestChannel`.
- ❌ `source: dynamic_engine` vs `pre_due_rule`/`on_due_rule`: el campo `source` distinguido **no existe**. El contacto siempre sale por `cobrai.debtor.contact_queue` con `rule_id`, sin discriminador de origen.
- ❌ `cobrai.debt.score_recalculated` no se publica.

### SCN-03 — Negociación por voz + promesa cumplida
- ✅ `PromiseToPay` existe; el agente lo crea en intent `promise_to_pay` y pone `status:"promised"` → segmento `minimal`.
- ✅ El recordatorio pre-promesa de la llamada usa `pendingPromise` para personalizar el mensaje ([contacts.service.ts:471-496](../apps/service-notifications/src/contacts/contacts.service.ts#L471-L496)).
- ✅ **Arreglado el cierre.** Al pagar, las promesas pendientes pasan a `kept` (o `partial` si el pago no cubre lo prometido) — [payment-events.service.ts](../apps/service-portfolios/src/debts/payment-events.service.ts). Sigue sin existir `cobrai.promise.kept` ni `debtor.promises_kept_count` (historial positivo agregado a futuro).

### SCN-04 — Promesa incumplida → re-segmentación
- ✅ **El job existe** (inline): marca `broken`, aplica transición `PROMISE_BROKEN`, dispara reglas `promise_broken` ([workflows.service.ts:593-609](../apps/service-workflows/src/workflows/workflows.service.ts#L593-L609)).
- ✅ `promisesBrokenScore` penaliza −25/promesa ([scoring-engine.ts:45-47](../packages/utils/src/scoring-engine.ts#L45-L47)); el recálculo de recovery_score lee `count(status:broken)` y **persiste**.
- ⚠️ `promises_broken_count` es **por deuda**, no por deudor (se cuenta vía `PromiseToPay` filtrado por `debtId`). El doc pide que afecte TODAS las deudas futuras del deudor → no se cumple.
- ❌ "promesa rota siempre prioriza Voz": no hay tal regla; el canal lo decide el waterfall/score como cualquier otro.
- ✅ **Bug corregido:** el job de vencidas ya excluye deudas `paid_full`/`written_off` ([workflows.service.ts](../apps/service-workflows/src/workflows/workflows.service.ts)) y el pago cierra la promesa antes.

### SCN-05 — Plan de cuotas por voz
- ✅ **Arreglado.** Modelo `PaymentPlan` + cuotas como `PromiseToPay` (con `planId`/`installmentNumber`). El intent `plan_request` (texto) y la llamada (voz) crean el plan vía [PaymentPlanService](../apps/service-notifications/src/agent/payment-plan.service.ts), ponen la deuda en `plan` y publican `cobrai.payment_plan.created`. Cada cuota reutiliza el seguimiento de promesas (recordatorio, incumplimiento, cierre por pago); el plan se marca `completed` al pagar la última. El reparto usa `buildInstallmentSchedule` (suma exacta).

### SCN-06 — Escalamiento legal / Crítico
- ⚠️ **Garantía más débil que la documentada.** `critical` (segmento) no bloquea contacto. La protección real es por estado: `evaluateTenant` solo procesa `active`/`contacted`; `escalateDebt` mueve a `legal_risk`. Pero la condición de escalamiento legal real es distinta a la del doc: `aging>180 && aiScore<20 && amount>=USD10k` **O** `brokenPromises>=5` **O** `sin consentimiento` ([workflows.service.ts:908-937](../apps/service-workflows/src/workflows/workflows.service.ts#L908-L937)).
- ❌ No hay modelo `LegalEscalation` ni evento `escalated_legal`; se usa `cobrai.debt.escalated` + `WorkflowExecution`.
- ⚠️ El escalamiento corre **después** de `executeRuleAction` en la misma iteración ([workflows.service.ts:522-533](../apps/service-workflows/src/workflows/workflows.service.ts#L522-L533)) → la deuda pudo ser contactada en ese mismo ciclo antes de escalar.

### SCN-07 — Fallback garantizado a voz
- ✅ **Reproduce exactamente** la secuencia de 4 pasos: `best(rec65,pri50,{solo teléfono})` → `voice` por fallback (no por condición de score). Verificado por script.
- ❌ No existe `channel_selection_trace` persistido; solo se guarda `bestChannel` (el resultado, no el cómo).

### SCN-08 — Sin canal disponible
- ✅ `bestChannelForScores` devuelve `null` cuando no hay datos → `cobrai.contact.failed.no_response` (`reason:"no_available_channel"`).
- ❌ Topic `cobrai.debt.no_channel_available` no existe; tampoco hay flag que saque la deuda del loop ni vista de dashboard dedicada confirmada.

### SCN-09 — Disputa
- ✅ **Implementado** (el doc lo marca como gap, incorrectamente): intent `dispute` → `status:"disputed"` → `cobrai.debt.disputed`. El estado `disputed` se excluye de la deuda activa del agente.
- ❌ No hay modelo `DisputeCase`, ni SLA, ni portal de evidencia, ni reactivación automática.

### SCN-10 — Pago parcial
- Pendiente de leer `service-payments` a fondo, pero: `handlePaymentConfirmed` ya distingue `paid_partial` vs `paid_full` por `amount_outstanding` ([workflows.service.ts:109-124](../apps/service-workflows/src/workflows/workflows.service.ts#L109-L124)). El recálculo de scores con el nuevo saldo ocurre en el siguiente ciclo. Evento `cobrai.debt.amount_updated` no existe.

### SCN-11 — Multi-portafolio aislado
- ✅ **Invariante respetado**: tanto `evaluateTenant` ([L488-508](../apps/service-workflows/src/workflows/workflows.service.ts#L488-L508)) como `evaluateTriggerRules` ([L699-722](../apps/service-workflows/src/workflows/workflows.service.ts#L699-L722)) filtran reglas por `portfolioId` en la query, con un guard extra `rule.portfolioId !== debt.portfolioId`. `max_amount_in_portfolio` también es por portafolio.
- ⚠️ Pero el **agente conversacional** elige la deuda de mayor monto del deudor cruzando portafolios ([conversation-agent.service.ts:79-108](../apps/service-notifications/src/agent/conversation-agent.service.ts#L79-L108)), y el `DebtorContactCoordinator` deduplica contactos **por deudor por semana** cruzando portafolios — el aislamiento NO es total a nivel de experiencia, contrario al "aislamiento total" que afirma el doc.

### SCN-12 — Compliance (horario/frecuencia)
- ✅ `ComplianceService.checkContact` valida opt-out, opt-in, consentimiento, horario y frecuencia ANTES de enviar, y reprograma a `next_allowed_at` ([compliance.service.ts:24-89](../packages/compliance/src/compliance.service.ts#L24-L89)). El scheduler además se salta ciclos fuera de horario de todos los países.
- ⚠️ **Riesgo:** la ruta de workflows usa `isChannelEligible` (que **NO** valida horario ni frecuencia — [compliance.service.ts:118-160](../packages/compliance/src/compliance.service.ts#L118-L160)); el horario/frecuencia se aplica recién en `executeContact` de service-notifications. Hay que garantizar que ninguna ruta llegue al adapter sin pasar por `checkBeforeSend`.
- ❌ No existe `cobrai.compliance.blocked`; falta el test anti-bypass con `priority_score=100`.

### SCN-13 — Deuda diferida que se activa
- ✅ **Implementado y cercano al doc**: `runDeferredTransitions` hace `future→upcoming` a 30d y `upcoming→new` en `scheduled_collection_date` (o `due_date`), publicando `cobrai.debt.created` y `cobrai.debt.status_changed` ([workflows.service.ts:939-1010](../apps/service-workflows/src/workflows/workflows.service.ts#L939-L1010)).
- ✅ `RuleEngineService` bloquea reglas para estados `future`/`upcoming` ([rule-engine.service.ts:19-21](../apps/service-workflows/src/rule-engine/rule-engine.service.ts#L19-L21)).
- ⚠️ Pero por el hallazgo #3, tras activarse la deuda **tampoco** habrá un recordatorio a −7d.

### SCN-14 — Cascada de canal (truncado en el input)
- El texto del escenario llegó cortado. La cascada existe vía [WaterfallService](../apps/service-notifications/src/orchestrator/waterfall.service.ts) con orden fijo `whatsapp→voice→email→sms` y `waitHours`. `nextChannel` avanza al siguiente canal disponible. Reauditar cuando se aporte el texto completo.

---

## Backlog priorizado de gaps

**✅ Hecho**
- Promesa cerrada al pagar (`kept`/`partial`) + job de vencidas excluye deudas terminales.
- `PaymentPlan` + cuotas encadenadas y acción real para intent `plan_request` (texto y voz).
- Capacidad pre-vencimiento vía `days_to_due` + gate de estado + regla -7d en los paquetes.

**P0 (corrección / seguridad de negocio) — pendiente**
- Garantizar que el contacto a segmento `critical` esté bloqueado por sí mismo (no solo por estado `legal_risk`), con test que lo pruebe.
- Test anti-bypass de compliance (`priority_score=100`, fuera de horario) y consolidar que toda ruta pase por `checkBeforeSend`.

**P1 (funcionalidad faltante) — pendiente**
- Contador histórico de promesas cumplidas por deudor + evento `cobrai.promise.kept` para scoring positivo.
- Trazabilidad: `source` de origen en el contacto + evento `cobrai.debt.score_recalculated` + `channel_selection_trace`.
- Vista/flag "sin canal disponible" y re-evaluación al actualizar datos de contacto.

**P2 (alineación doc/realidad) — pendiente**
- Renombrar/alinear nombres de eventos del doc a los reales, o crear los faltantes.
- Corregir el doc: SCN-09 (disputa) ya está implementado; el aislamiento multi-portafolio NO es total a nivel de experiencia.
