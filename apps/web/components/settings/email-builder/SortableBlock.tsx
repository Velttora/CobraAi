"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Trash2 } from "lucide-react";
import type { EmailBlock } from "@cobrai/utils/email-layout";
import { BLOCK_LABELS } from "./blocks";
import { cn } from "../../../lib/utils";

function summary(block: EmailBlock): string {
  const p = block.props;
  switch (block.type) {
    case "body":
      return "Mensaje de la regla (dinámico)";
    case "heading":
    case "text":
      return typeof p.text === "string" && p.text ? p.text : "—";
    case "button":
      return typeof p.text === "string" ? p.text : "Botón";
    case "logo":
    case "image":
      return typeof p.src === "string" && p.src ? String(p.src) : "Sin imagen";
    case "signature":
      return "Firma del tenant";
    case "social":
      return "Enlaces de redes";
    case "divider":
      return "Línea separadora";
    case "spacer":
      return `Espacio ${typeof p.height === "number" ? p.height : 24}px`;
    default:
      return "";
  }
}

export function SortableBlock({
  block,
  selected,
  onSelect,
  onDelete,
  onDuplicate
}: {
  block: EmailBlock;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md border bg-white px-2 py-2 dark:bg-slate-900",
        selected
          ? "border-[#D85A30] ring-1 ring-[#D85A30]/30"
          : "border-slate-200 dark:border-slate-700",
        isDragging && "opacity-50"
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        aria-label="Reordenar"
        className="cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
          {BLOCK_LABELS[block.type]}
          {block.type === "body" && (
            <span className="ml-1.5 rounded bg-[#D85A30]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#D85A30]">
              dinámico
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
          {summary(block)}
        </span>
      </button>

      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button aria-label="Duplicar" className="text-slate-400 hover:text-slate-600" onClick={onDuplicate} type="button">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button aria-label="Eliminar" className="text-slate-400 hover:text-red-500" onClick={onDelete} type="button">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
