import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { KIND_ICON } from "@/lib/sourceKinds";
import type { ChatSource } from "@/types";

interface SourcesPanelProps {
  sources: ChatSource[];
  open: boolean;
  onToggle: () => void;
  onOpenSource: (source: ChatSource) => void;
}

export function SourcesPanel({ sources, open, onToggle, onOpenSource }: SourcesPanelProps) {
  return (
    <aside
      className={[
        "shrink-0 overflow-y-auto border-hairline transition-[width] duration-200",
        open ? "w-full border-t lg:w-[300px] lg:border-t-0 lg:border-l" : "w-full lg:w-[52px] lg:border-l",
      ].join(" ")}
    >
      <div className="flex items-center justify-between px-4 py-4 lg:px-5">
        {open && (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            Grounded on
          </p>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "Collapse sources panel" : "Expand sources panel"}
          aria-expanded={open}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-stone transition-colors hover:bg-surface-card hover:text-ink"
        >
          {open ? (
            <PanelRightClose className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <PanelRightOpen className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 px-4 pb-6 lg:px-5">
          {sources.length === 0 ? (
            <p className="text-[13px] text-stone">
              Nothing grounding this conversation yet. Use the paperclip icon to pick
              documents from My Data, or ask a question that needs a web search.
            </p>
          ) : (
            sources.map((source) => {
              const Icon = KIND_ICON[source.kind];
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => onOpenSource(source)}
                  className="rounded-xl border border-hairline bg-surface-card p-3.5 text-left transition-colors duration-150 hover:border-teal-deep/60"
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-deep" strokeWidth={1.75} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{source.title}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-stone">
                        {source.uploadedAt}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2.5 line-clamp-3 text-[12px] leading-relaxed text-ink/70">
                    {source.excerpt}
                  </p>
                </button>
              );
            })
          )}
        </div>
      )}
    </aside>
  );
}
