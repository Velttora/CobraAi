-- Abonado acumulado por compromiso.
--
-- Antes el estado de una promesa se resolvía comparando el pago que acababa de
-- entrar contra el monto prometido completo, sin memoria de los anteriores: dos
-- abonos de la mitad dejaban la promesa en `partial` para siempre aunque
-- sumaran lo pactado.
ALTER TABLE "promises_to_pay"
  ADD COLUMN "amount_paid" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Una promesa cumplida está cubierta por definición. Sin este backfill, todo el
-- historial arrancaría en 0 y el avance de los planes ya pagados se vería vacío.
UPDATE "promises_to_pay"
  SET "amount_paid" = "amount"
  WHERE "status" = 'kept';
