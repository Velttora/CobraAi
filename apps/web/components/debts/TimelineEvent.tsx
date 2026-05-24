import { cn } from "../../lib/utils";

export function TimelineEvent({
  type,
  at,
  data
}: {
  type: string;
  at: string;
  data?: Record<string, unknown>;
}) {
  return (
    <li className="relative border-l-2 border-slate-200 pl-4 pb-6 last:pb-0 dark:border-slate-700">
      <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[#D85A30]" />
      <p className="text-sm font-medium capitalize text-slate-900 dark:text-slate-100">
        {type.replace(/_/g, " ")}
      </p>
      <time className="text-xs text-slate-500">
        {new Date(at).toLocaleString("es-CO")}
      </time>
      {data && Object.keys(data).length > 0 ? (
        <pre
          className={cn(
            "mt-2 overflow-x-auto rounded-md bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400"
          )}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </li>
  );
}
