import { describe, expect, it } from "vitest";
// Módulo CommonJS sin dependencias: se carga tal cual corre en Fly, sin
// arrastrar el runner (que instancia Prisma y arranca al importarse).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { splitSqlStatements } = require("./split-sql-statements.cjs") as {
  splitSqlStatements: (sql: string) => string[];
};

describe("splitSqlStatements", () => {
  it("separa sentencias simples", () => {
    const parts = splitSqlStatements(
      `ALTER TABLE "a" ADD COLUMN "x" INT;\nUPDATE "a" SET "x" = 1;`
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("ADD COLUMN");
  });

  it("no parte un bloque DO $$ ... $$ por sus punto y coma internos", () => {
    // Este es el caso que dejó una migración a medio aplicar en producción:
    // el bloque llegaba cortado y Postgres respondía "unterminated
    // dollar-quoted string".
    const sql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'viejo') THEN
    ALTER INDEX "viejo" RENAME TO "nuevo";
  END IF;
END $$;
`;
    const parts = splitSqlStatements(sql);

    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    expect(parts[1]).toContain("BEGIN");
    expect(parts[1]).toContain("END IF");
    expect(parts[1]?.endsWith("END $$")).toBe(true);
  });

  it("respeta etiquetas con nombre ($fn$)", () => {
    const sql = `CREATE FUNCTION f() RETURNS int AS $fn$ BEGIN RETURN 1; END $fn$ LANGUAGE plpgsql;`;
    expect(splitSqlStatements(sql)).toHaveLength(1);
  });

  it("ignora el punto y coma dentro de una cadena", () => {
    const sql = `INSERT INTO t (a) VALUES ('uno; dos');\nSELECT 1;`;
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("'uno; dos'");
  });

  it("descarta comentarios y sentencias vacías", () => {
    const parts = splitSqlStatements(`-- comentario\n\nSELECT 1;\n\n;\n`);
    expect(parts).toEqual(["SELECT 1"]);
  });
});
