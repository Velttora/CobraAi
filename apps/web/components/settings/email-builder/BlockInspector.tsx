"use client";

import { AVAILABLE_EMAIL_VARIABLES, type EmailBlock } from "@cobrai/utils/email-layout";
import { BLOCK_LABELS } from "./blocks";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";

const ALIGN_OPTIONS = [
  { value: "left", label: "Izquierda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Derecha" }
];

function s(props: Record<string, unknown>, key: string): string {
  const v = props[key];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

export function BlockInspector({
  block,
  onChange
}: {
  block: EmailBlock;
  onChange: (props: Record<string, unknown>) => void;
}): React.ReactElement {
  const set = (key: string, value: unknown) => onChange({ ...block.props, [key]: value });

  function TextField({
    label,
    fieldKey,
    textarea = false,
    placeholder,
    withVariables = false
  }: {
    label: string;
    fieldKey: string;
    textarea?: boolean;
    placeholder?: string;
    withVariables?: boolean;
  }) {
    return (
      <label className="block text-sm">
        {label}
        {textarea ? (
          <textarea
            className={`${inputClass} min-h-20 font-mono`}
            onChange={(e) => set(fieldKey, e.target.value)}
            placeholder={placeholder}
            value={s(block.props, fieldKey)}
          />
        ) : (
          <input
            className={inputClass}
            onChange={(e) => set(fieldKey, e.target.value)}
            placeholder={placeholder}
            value={s(block.props, fieldKey)}
          />
        )}
        {withVariables && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {AVAILABLE_EMAIL_VARIABLES.map((v) => (
              <button
                className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-[#D85A30] hover:text-[#D85A30] dark:border-slate-700"
                key={v.key}
                onClick={() =>
                  set(fieldKey, `${s(block.props, fieldKey)}{{${v.key}}}`)
                }
                title={v.label}
                type="button"
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </span>
        )}
      </label>
    );
  }

  function NumberField({ label, fieldKey, placeholder }: { label: string; fieldKey: string; placeholder?: string }) {
    return (
      <label className="block text-sm">
        {label}
        <input
          className={inputClass}
          onChange={(e) => set(fieldKey, e.target.value === "" ? undefined : Number(e.target.value))}
          placeholder={placeholder}
          type="number"
          value={s(block.props, fieldKey)}
        />
      </label>
    );
  }

  function SelectField({
    label,
    fieldKey,
    options,
    fallback
  }: {
    label: string;
    fieldKey: string;
    options: { value: string; label: string }[];
    fallback: string;
  }) {
    return (
      <label className="block text-sm">
        {label}
        <select
          className={inputClass}
          onChange={(e) => set(fieldKey, e.target.value)}
          value={s(block.props, fieldKey) || fallback}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function ColorField({ label, fieldKey, placeholder }: { label: string; fieldKey: string; placeholder?: string }) {
    return (
      <label className="block text-sm">
        {label}
        <input
          className={inputClass}
          onChange={(e) => set(fieldKey, e.target.value || undefined)}
          placeholder={placeholder ?? "#333333"}
          value={s(block.props, fieldKey)}
        />
      </label>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {BLOCK_LABELS[block.type]}
      </p>

      {block.type === "logo" && (
        <>
          <TextField fieldKey="src" label="URL de la imagen" placeholder="https://..." />
          <TextField fieldKey="alt" label="Texto alternativo" />
          <NumberField fieldKey="width" label="Ancho (px)" />
          <SelectField fallback="left" fieldKey="align" label="Alineación" options={ALIGN_OPTIONS} />
          <TextField fieldKey="link" label="Enlace (opcional)" placeholder="https://..." />
        </>
      )}

      {block.type === "heading" && (
        <>
          <TextField fieldKey="text" label="Texto" withVariables />
          <SelectField
            fallback="2"
            fieldKey="level"
            label="Nivel"
            options={[
              { value: "1", label: "H1 (grande)" },
              { value: "2", label: "H2 (medio)" },
              { value: "3", label: "H3 (pequeño)" }
            ]}
          />
          <SelectField fallback="left" fieldKey="align" label="Alineación" options={ALIGN_OPTIONS} />
          <ColorField fieldKey="color" label="Color del texto" />
          <ColorField fieldKey="backgroundColor" label="Color de fondo (barra de marca)" placeholder="vacío = sin barra" />
        </>
      )}

      {block.type === "text" && (
        <>
          <TextField fieldKey="text" label="Texto" textarea withVariables />
          <SelectField fallback="left" fieldKey="align" label="Alineación" options={ALIGN_OPTIONS} />
          <ColorField fieldKey="color" label="Color" />
        </>
      )}

      {block.type === "body" && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          Este bloque se reemplaza automáticamente por el <strong>mensaje de cada
          regla</strong> al enviar el correo. No necesita configuración.
        </p>
      )}

      {block.type === "button" && (
        <>
          <TextField fieldKey="text" label="Texto del botón" withVariables />
          <TextField fieldKey="href" label="Enlace" placeholder="{{link_pago}}" withVariables />
          <SelectField fallback="center" fieldKey="align" label="Alineación" options={ALIGN_OPTIONS} />
          <ColorField fieldKey="bgColor" label="Color de fondo" placeholder="color de marca" />
          <ColorField fieldKey="textColor" label="Color del texto" placeholder="#ffffff" />
        </>
      )}

      {block.type === "image" && (
        <>
          <TextField fieldKey="src" label="URL de la imagen" placeholder="https://..." />
          <TextField fieldKey="alt" label="Texto alternativo" />
          <NumberField fieldKey="width" label="Ancho (px)" />
          <SelectField fallback="center" fieldKey="align" label="Alineación" options={ALIGN_OPTIONS} />
          <TextField fieldKey="link" label="Enlace (opcional)" placeholder="https://..." />
        </>
      )}

      {block.type === "divider" && (
        <>
          <ColorField fieldKey="color" label="Color" placeholder="#eeeeee" />
          <NumberField fieldKey="thickness" label="Grosor (px)" placeholder="1" />
        </>
      )}

      {block.type === "spacer" && <NumberField fieldKey="height" label="Altura (px)" placeholder="24" />}

      {block.type === "social" && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          Usa los enlaces de redes definidos en la pestaña <strong>Firma</strong>.
        </p>
      )}

      {block.type === "signature" && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          Edita el contenido de la firma en la pestaña <strong>Firma</strong>. Se
          refleja en todos los correos que usen este bloque.
        </p>
      )}
    </div>
  );
}
