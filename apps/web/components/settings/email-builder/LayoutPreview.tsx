"use client";

import { useMemo } from "react";
import { renderEmailLayout, type EmailLayoutConfig } from "@cobrai/utils/email-layout";
import { SAMPLE_BODY, SAMPLE_VARIABLES } from "./blocks";

/**
 * Vista previa fiel: usa EXACTAMENTE el mismo renderer que el envío real
 * (`renderEmailLayout` de @cobrai/utils), dentro de un iframe aislado.
 */
export function LayoutPreview({
  config
}: {
  config: EmailLayoutConfig;
}): React.ReactElement {
  const html = useMemo(
    () => renderEmailLayout(config, { body: SAMPLE_BODY, variables: SAMPLE_VARIABLES }),
    [config]
  );

  return (
    <iframe
      className="h-full w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
      sandbox=""
      srcDoc={html}
      title="Vista previa del correo"
    />
  );
}
