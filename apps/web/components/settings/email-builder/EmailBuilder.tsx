"use client";

import { useAuth } from "@clerk/nextjs";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import {
  normalizeLayoutConfig,
  type EmailBlockType,
  type EmailLayoutConfig,
  type EmailSignature
} from "@cobrai/utils/email-layout";
import { Eye, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useEmailLayout,
  usePublishEmailLayout,
  useSaveEmailLayoutDraft
} from "../../../hooks/use-email-layout";
import { cn } from "../../../lib/utils";
import { BlockInspector } from "./BlockInspector";
import { createBlock, PALETTE } from "./blocks";
import { LayoutPreview } from "./LayoutPreview";
import { SignatureEditor } from "./SignatureEditor";
import { SortableBlock } from "./SortableBlock";

type RightTab = "block" | "signature" | "style";

function DraggablePaletteButton({
  type,
  label,
  hint,
  onAdd
}: {
  type: EmailBlockType;
  label: string;
  hint: string;
  onAdd: () => void;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`
  });
  return (
    <button
      className={cn(
        "w-full rounded-md border border-slate-200 px-3 py-2 text-left transition hover:border-[#D85A30] dark:border-slate-700",
        isDragging && "opacity-50"
      )}
      onClick={onAdd}
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
    >
      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
        {label}
      </span>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
    </button>
  );
}

export function EmailBuilder(): React.ReactElement {
  const { orgRole } = useAuth();
  const isAdmin = (orgRole?.replace(/^org:/, "") ?? "viewer") === "admin";

  const layoutQuery = useEmailLayout();
  const saveDraft = useSaveEmailLayoutDraft();
  const publish = usePublishEmailLayout();

  const [config, setConfig] = useState<EmailLayoutConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("block");
  const [showPreview, setShowPreview] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Inicializa el editor una sola vez con el borrador del servidor.
  useEffect(() => {
    if (config === null && layoutQuery.data?.data) {
      setConfig(normalizeLayoutConfig(layoutQuery.data.data.draft));
    }
  }, [config, layoutQuery.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const selectedBlock = useMemo(
    () => config?.blocks.find((b) => b.id === selectedId) ?? null,
    [config, selectedId]
  );
  const hasBodyBlock = useMemo(
    () => Boolean(config?.blocks.some((b) => b.type === "body")),
    [config]
  );

  function mutate(next: EmailLayoutConfig): void {
    setConfig(next);
    setDirty(true);
  }

  function addBlock(type: EmailBlockType): void {
    if (!config) return;
    if (type === "body" && hasBodyBlock) {
      toast.info("Ya existe un bloque de Cuerpo (solo se permite uno).");
      return;
    }
    const block = createBlock(type);
    mutate({ ...config, blocks: [...config.blocks, block] });
    setSelectedId(block.id);
    setRightTab(type === "signature" ? "signature" : "block");
  }

  function handleDragEnd(event: DragEndEvent): void {
    if (!config) return;
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);

    if (activeId.startsWith("palette:")) {
      const type = activeId.slice("palette:".length) as EmailBlockType;
      if (type === "body" && hasBodyBlock) {
        toast.info("Ya existe un bloque de Cuerpo (solo se permite uno).");
        return;
      }
      const block = createBlock(type);
      const blocks = [...config.blocks];
      const overIndex = blocks.findIndex((b) => b.id === String(over.id));
      if (overIndex >= 0) blocks.splice(overIndex + 1, 0, block);
      else blocks.push(block);
      mutate({ ...config, blocks });
      setSelectedId(block.id);
      setRightTab(type === "signature" ? "signature" : "block");
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = config.blocks.findIndex((b) => b.id === active.id);
      const newIndex = config.blocks.findIndex((b) => b.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        mutate({ ...config, blocks: arrayMove(config.blocks, oldIndex, newIndex) });
      }
    }
  }

  function updateBlockProps(id: string, props: Record<string, unknown>): void {
    if (!config) return;
    mutate({
      ...config,
      blocks: config.blocks.map((b) => (b.id === id ? { ...b, props } : b))
    });
  }

  function deleteBlock(id: string): void {
    if (!config) return;
    mutate({ ...config, blocks: config.blocks.filter((b) => b.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateBlock(id: string): void {
    if (!config) return;
    const idx = config.blocks.findIndex((b) => b.id === id);
    const src = config.blocks[idx];
    if (idx < 0 || !src) return;
    if (src.type === "body") {
      toast.info("El bloque de Cuerpo no se puede duplicar.");
      return;
    }
    const copy = createBlock(src.type);
    copy.props = { ...src.props };
    const blocks = [...config.blocks];
    blocks.splice(idx + 1, 0, copy);
    mutate({ ...config, blocks });
  }

  function updateSignature(signature: EmailSignature): void {
    if (!config) return;
    mutate({ ...config, signature });
  }

  function updateSettings(patch: Partial<EmailLayoutConfig["settings"]>): void {
    if (!config) return;
    mutate({ ...config, settings: { ...config.settings, ...patch } });
  }

  async function handleSave(): Promise<void> {
    if (!config) return;
    await saveDraft.mutateAsync(config);
    setDirty(false);
  }

  async function handlePublish(): Promise<void> {
    if (!config) return;
    // Guarda el borrador actual y luego lo publica, para que coincidan.
    await saveDraft.mutateAsync(config);
    setDirty(false);
    await publish.mutateAsync();
  }

  if (layoutQuery.isLoading || config === null) {
    return <p className="text-sm text-slate-500">Cargando editor…</p>;
  }
  if (layoutQuery.isError) {
    return (
      <p className="text-sm text-[#A32D2D]">
        No se pudo cargar la plantilla de correo. Verifica que el gateway esté en
        ejecución.
      </p>
    );
  }

  const data = layoutQuery.data?.data;
  const isPending = saveDraft.isPending || publish.isPending;

  return (
    <div className="space-y-4">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Plantilla de correo
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data?.has_published ? (
              <>
                Publicada
                {data.published_at
                  ? ` · ${new Date(data.published_at).toLocaleDateString("es-CO")}`
                  : ""}
                {dirty ? " · borrador sin publicar" : ""}
              </>
            ) : (
              "Aún no publicada — los correos usan el diseño por defecto."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
            onClick={() => setShowPreview((v) => !v)}
            type="button"
          >
            {showPreview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreview ? "Editar" : "Vista previa"}
          </button>
          {isAdmin && (
            <>
              <button
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700"
                disabled={isPending || !dirty}
                onClick={() => void handleSave()}
                type="button"
              >
                Guardar borrador
              </button>
              <button
                className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-50"
                disabled={isPending}
                onClick={() => void handlePublish()}
                type="button"
              >
                {publish.isPending ? "Publicando…" : "Publicar"}
              </button>
            </>
          )}
        </div>
      </div>

      {!hasBodyBlock && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Falta el bloque <strong>Cuerpo del mensaje</strong>. Sin él, el mensaje
          de la regla se añadirá al final automáticamente.
        </p>
      )}

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
        <div className="grid gap-4 lg:grid-cols-[200px_1fr_320px]">
          {/* Paleta */}
          <aside className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Bloques
            </p>
            {PALETTE.map((p) => (
              <DraggablePaletteButton
                hint={p.hint}
                key={p.type}
                label={p.label}
                onAdd={() => addBlock(p.type)}
                type={p.type}
              />
            ))}
          </aside>

          {/* Centro: lienzo o preview */}
          <section className="min-h-[480px]">
            {showPreview ? (
              <div className="h-[640px]">
                <LayoutPreview config={config} />
              </div>
            ) : (
              <CanvasDropzone>
                <SortableContext
                  items={config.blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {config.blocks.length === 0 ? (
                      <p className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-700">
                        Arrastra o haz clic en un bloque para empezar.
                      </p>
                    ) : (
                      config.blocks.map((block) => (
                        <SortableBlock
                          block={block}
                          key={block.id}
                          onDelete={() => deleteBlock(block.id)}
                          onDuplicate={() => duplicateBlock(block.id)}
                          onSelect={() => {
                            setSelectedId(block.id);
                            setRightTab(block.type === "signature" ? "signature" : "block");
                          }}
                          selected={selectedId === block.id}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </CanvasDropzone>
            )}
          </section>

          {/* Inspector derecho */}
          <aside className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-3 flex gap-1 rounded-md bg-slate-100 p-1 text-xs dark:bg-slate-800">
              {(["block", "signature", "style"] as RightTab[]).map((tab) => (
                <button
                  className={cn(
                    "flex-1 rounded px-2 py-1 font-medium transition",
                    rightTab === tab
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                      : "text-slate-500"
                  )}
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  type="button"
                >
                  {tab === "block" ? "Bloque" : tab === "signature" ? "Firma" : "Estilo"}
                </button>
              ))}
            </div>

            {rightTab === "block" &&
              (selectedBlock ? (
                <BlockInspector
                  block={selectedBlock}
                  onChange={(props) => updateBlockProps(selectedBlock.id, props)}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Selecciona un bloque del lienzo para editarlo.
                </p>
              ))}

            {rightTab === "signature" && (
              <SignatureEditor onChange={updateSignature} signature={config.signature} />
            )}

            {rightTab === "style" && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Estilo global
                </p>
                <label className="block text-sm">
                  Color de marca
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    onChange={(e) => updateSettings({ brandColor: e.target.value })}
                    value={config.settings.brandColor}
                  />
                </label>
                <label className="block text-sm">
                  Color de fondo
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                    value={config.settings.backgroundColor}
                  />
                </label>
                <label className="block text-sm">
                  Ancho del contenido (px)
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    onChange={(e) => updateSettings({ contentWidth: Number(e.target.value) || 600 })}
                    type="number"
                    value={config.settings.contentWidth}
                  />
                </label>
              </div>
            )}
          </aside>
        </div>
      </DndContext>

      {!isAdmin && (
        <p className="text-xs text-slate-500">
          Solo los administradores pueden guardar o publicar cambios.
        </p>
      )}
    </div>
  );
}

/** Zona droppable que envuelve el lienzo para permitir soltar en área vacía. */
function CanvasDropzone({ children }: { children: React.ReactNode }): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-dropzone" });
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition",
        isOver
          ? "border-[#D85A30] bg-[#D85A30]/5"
          : "border-slate-200 dark:border-slate-700"
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
}
