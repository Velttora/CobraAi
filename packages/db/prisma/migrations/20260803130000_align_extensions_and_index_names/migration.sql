-- Cierra la brecha entre las migraciones del repo y schema.prisma.
--
-- Hasta aquí, aplicar TODAS las migraciones sobre una base vacía NO producía el
-- schema declarado: `prisma migrate diff` reportaba dos diferencias. Eso hacía
-- que `prisma migrate dev` detectara drift en cualquier entorno y propusiera
-- resetear la base. Esta migración deja el diff en cero.

-- 1. Extensiones declaradas en el datasource (`extensions = [uuidOssp, pgcrypto]`)
--    que ninguna migración instalaba. En PostgreSQL 13+ `gen_random_uuid()` es
--    nativo, así que los defaults funcionaban de casualidad, pero el estado real
--    no coincidía con el declarado.
--
--    Nota para entornos gestionados: si el rol de la app no tiene permiso para
--    CREATE EXTENSION, hay que instalarlas una vez con un rol privilegiado; el
--    IF NOT EXISTS hace que esta migración pase sin ruido cuando ya existen.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. `20260525120000_portfolio_automation` creó este índice con un nombre de 68
--    caracteres. Postgres trunca los identificadores a 63 y lo dejó como
--    "..._created_a"; Prisma, al truncar, reserva el sufijo "_idx" y espera
--    "..._creat_idx". El índice es el mismo, solo cambia el nombre.
--
--    Se hace condicional para que sea seguro en cualquier entorno: si la base ya
--    tiene el nombre correcto (o el índice no existe), no hace nada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'i'
      AND relname = 'portfolio_package_applications_tenant_id_portfolio_id_created_a'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'i'
      AND relname = 'portfolio_package_applications_tenant_id_portfolio_id_creat_idx'
  ) THEN
    ALTER INDEX "portfolio_package_applications_tenant_id_portfolio_id_created_a"
      RENAME TO "portfolio_package_applications_tenant_id_portfolio_id_creat_idx";
  END IF;
END $$;
