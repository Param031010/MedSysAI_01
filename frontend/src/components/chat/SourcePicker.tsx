import { Link } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import { KIND_ICON } from "@/lib/sourceKinds";
import type { ChatSource } from "@/types";

interface SourcePickerProps {
  sources: ChatSource[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function SourcePicker({ sources, selectedIds, onToggle }: SourcePickerProps) {
  return (
    <div className="absolute bottom-full left-0 mb-2 w-[300px] max-w-[80vw] rounded-xl border border-hairline bg-bg-mist shadow-lg">
      <p className="border-b border-hairline px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
        Ground this chat on
      </p>

      <div className="max-h-64 overflow-y-auto p-2">
        {sources.length === 0 ? (
          <p className="px-2 py-4 text-center text-[12px] text-stone">
            No documents yet — add some in My Data.
          </p>
        ) : (
          sources.map((source) => {
            const Icon = KIND_ICON[source.kind];
            const selected = selectedIds.includes(source.id);
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => onToggle(source.id)}
                aria-pressed={selected}
                className={[
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150",
                  selected ? "bg-surface-card" : "hover:bg-surface-card/60",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    selected
                      ? "border-teal-deep bg-teal-deep text-bg-mist"
                      : "border-hairline text-transparent",
                  ].join(" ")}
                >
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <Icon className="h-3.5 w-3.5 shrink-0 text-teal-deep" strokeWidth={1.75} />
                <span className="truncate text-[13px] text-ink/85">{source.title}</span>
              </button>
            );
          })
        )}
      </div>

      <Link
        to="/my-data"
        className="flex items-center gap-1.5 border-t border-hairline px-4 py-2.5 text-[12px] text-teal-deep hover:underline"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        Add more in My Data
      </Link>
    </div>
  );
}
