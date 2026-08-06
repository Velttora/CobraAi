/**
 * Divide un archivo de migración en sentencias SQL ejecutables.
 *
 * Vive aparte del runner y sin dependencias a propósito: el runner instancia
 * Prisma y arranca solo al cargarse, así que importarlo desde un test hacía
 * fallar el proceso entero cuando no había base a la que conectarse.
 *
 * Respeta los bloques `$$ … $$` y las cadenas entre comillas simples. Partir
 * por `;` a secas rompe cualquier `DO`/función en pedazos que no compilan:
 * Postgres contesta "unterminated dollar-quoted string" y la migración queda a
 * medio aplicar.
 */
function splitSqlStatements(sql) {
  const withoutComments = sql.replace(/^--.*$/gm, "");
  const statements = [];
  let current = "";
  let dollarTag = null;
  let inString = false;
  let i = 0;

  while (i < withoutComments.length) {
    const char = withoutComments[i];

    if (dollarTag) {
      if (withoutComments.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += char;
      i += 1;
      continue;
    }

    if (inString) {
      current += char;
      // Una comilla escapada ('') cierra y vuelve a abrir: el resultado es el
      // mismo que tratarla como parte de la cadena.
      if (char === "'") inString = false;
      i += 1;
      continue;
    }

    if (char === "'") {
      inString = true;
      current += char;
      i += 1;
      continue;
    }

    const tag = /^\$[A-Za-z_]*\$/.exec(withoutComments.slice(i));
    if (tag) {
      dollarTag = tag[0];
      current += dollarTag;
      i += dollarTag.length;
      continue;
    }

    if (char === ";") {
      statements.push(current);
      current = "";
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }
  statements.push(current);

  return statements.map((part) => part.trim()).filter((part) => part.length > 0);
}

module.exports = { splitSqlStatements };
