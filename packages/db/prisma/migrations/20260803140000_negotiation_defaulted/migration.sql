-- Estado para el acuerdo que se pactó y el deudor incumplió. Distinto de
-- `rejected` (nunca hubo acuerdo) y de `expired` (la oferta venció sin cerrarse).
--
-- En PostgreSQL 12+ ALTER TYPE ... ADD VALUE puede correr dentro de una
-- transacción mientras el valor nuevo no se USE en la misma transacción; aquí
-- solo se agrega, así que la migración de Prisma no necesita tratamiento especial.
ALTER TYPE "negotiation_status" ADD VALUE IF NOT EXISTS 'defaulted';
