import { useState } from "react";
import { Plus, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";
import type { ChatSession } from "@/types";

interface SessionListProps {
  sessions: ChatSession[];
  activeId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => Promise<void>;
}

export function SessionList({
  sessions,
  activeId,
  open,
  onToggle,
  onSelect,
  onNewChat,
  onDelete,
}: SessionListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <aside
      className={[
        "shrink-0 overflow-y-auto border-hairline transition-[width] duration-200",
        open ? "w-full border-b lg:w-[240px] lg:border-b-0 lg:border-r" : "w-full lg:w-[52px] lg:border-r",
      ].join(" ")}
    >
      <div className="flex items-center justify-between px-4 py-4 lg:px-5">
        {open && (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone">Chats</p>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "Collapse chat list" : "Expand chat list"}
          aria-expanded={open}
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-stone transition-colors hover:bg-surface-card hover:text-ink ${open ? "ml-auto" : ""}`}
        >
          {open ? (
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 px-3 pb-6">
          <button
            type="button"
            onClick={onNewChat}
            className="mb-2 flex items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-[13px] text-ink transition-colors duration-150 hover:border-teal-deep hover:text-teal-deep"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            New chat
          </button>

          {sessions.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-stone">No conversations yet.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="group relative flex items-center"
              >
                <button
                  type="button"
                  onClick={() => onSelect(session.id)}
                  className={[
                    "flex-1 truncate rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150 pr-8",
                    session.id === activeId
                      ? "bg-ink text-bg-mist"
                      : "text-ink/80 hover:bg-surface-card",
                  ].join(" ")}
                >
                  {session.title}
                </button>

                <button
                  type="button"
                  aria-label={`Delete chat: ${session.title}`}
                  onClick={(e) => handleDelete(e, session.id)}
                  disabled={deletingId === session.id}
                  className={[
                    "absolute right-1 flex h-6 w-6 items-center justify-center rounded-md transition-all duration-150",
                    "opacity-0 group-hover:opacity-100 focus:opacity-100",
                    deletingId === session.id ? "opacity-100 cursor-wait" : "",
                    session.id === activeId
                      ? "text-bg-mist/60 hover:bg-white/10 hover:text-bg-mist"
                      : "text-stone hover:bg-red-50 hover:text-red-500",
                  ].join(" ")}
                >
                  <Trash2
                    className={`h-3.5 w-3.5 ${deletingId === session.id ? "animate-pulse" : ""}`}
                    strokeWidth={1.75}
                  />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
