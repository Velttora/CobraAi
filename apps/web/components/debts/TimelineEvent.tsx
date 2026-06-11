import { formatDateTime } from "../../lib/formatters";
import { formatTimelineEvent } from "../../lib/timeline-formatter";

export function TimelineEvent({
  type,
  at,
  data
}: {
  type: string;
  at: string;
  data?: Record<string, unknown>;
}) {
  const event = formatTimelineEvent(type, data);

  return (
    <li className="relative border-l-2 border-slate-200 pl-4 pb-6 last:pb-0 dark:border-slate-700">
      <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[#D85A30]" />
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {event.title}
      </p>
      <time className="text-xs text-slate-500">{formatDateTime(at)}</time>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {event.description}
      </p>
      {event.meta.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-500 dark:text-slate-500">
          {event.meta.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
