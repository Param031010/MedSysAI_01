import type { KeyboardEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { KIND_ICON, KIND_LABEL } from "@/lib/sourceKinds";
import type { ChatSource } from "@/types";

interface DataCardProps {
  source: ChatSource;
  processing?: boolean;
  deleting?: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function DataCard({ source, processing, deleting, onClick, onDelete }: DataCardProps) {
  const Icon = KIND_ICON[source.kind];
  const busy = processing || deleting;

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (busy) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      role="button"
      tabIndex={busy ? -1 : 0}
      onClick={() => !busy && onClick()}
      onKeyDown={handleKeyDown}
      aria-disabled={busy}
      className="flex flex-col items-start rounded-2xl border border-hairline bg-surface-card p-5 text-left transition-colors duration-150 hover:border-teal-deep hover:-translate-y-0.5 aria-disabled:cursor-wait aria-disabled:hover:translate-y-0 aria-disabled:hover:border-hairline"
    >
      <div className="flex w-full items-center justify-between gap-2">
        {processing ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-deep" strokeWidth={1.75} />
        ) : (
          <Icon className="h-4 w-4 shrink-0 text-teal-deep" strokeWidth={1.75} />
        )}
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
            {KIND_LABEL[source.kind]}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!busy) onDelete();
            }}
            disabled={busy}
            aria-label={`Delete ${source.title}`}
            title="Delete"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-stone/60 transition-colors duration-150 hover:bg-clay-alert/10 hover:text-clay-alert disabled:opacity-40"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 font-display text-[17px] leading-snug text-ink">
        {source.title}
      </p>
      <p className="mt-1 font-mono text-[11px] text-stone">
        {processing ? "Processing…" : source.uploadedAt}
      </p>

      <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-ink/70">
        {source.excerpt}
      </p>
    </div>
  );
}
