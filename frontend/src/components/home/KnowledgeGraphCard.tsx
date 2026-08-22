import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Loader2, Plus, Waypoints } from "lucide-react";
import type { KnowledgeGraph } from "@/types";
import { logSymptom } from "@/services/symptoms";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const CLOSE_WINDOW_DAYS = 7;
const SIZE = 360;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 56;

interface LaidOutNode {
  id: string;
  label: string;
  date: string;
  x: number;
  y: number;
}

function layoutNodes(nodes: KnowledgeGraph["nodes"]): LaidOutNode[] {
  const n = nodes.length;
  if (n === 1) {
    return [{ ...nodes[0], x: CENTER, y: CENTER }];
  }
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      ...node,
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    };
  });
}

interface KnowledgeGraphCardProps {
  graph: KnowledgeGraph;
  /** Re-fetches the Home snapshot so a newly logged symptom joins the
   * graph without waiting for the next page visit. */
  onLogged: () => void;
}

function edgeKey(edge: KnowledgeGraph["edges"][number]): string {
  return `${edge.source}→${edge.target}`;
}

export function KnowledgeGraphCard({ graph, onLogged }: KnowledgeGraphCardProps) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(today);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState(false);
  // Node/edge details (symptom names, dates, day counts) stay hidden until
  // the viewer hovers or taps that specific one — the graph's shape is
  // visible at a glance, the health data behind it isn't, by default.
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const laidOut = useMemo(() => layoutNodes(graph.nodes), [graph.nodes]);
  const nodeById = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut]);
  const closePairs = graph.edges.filter((e) => e.durationDays <= CLOSE_WINDOW_DAYS).length;
  const hasSignal = closePairs > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || logging) return;

    setLogging(true);
    setError(null);
    try {
      await logSymptom(trimmed, date);
      setName("");
      setDate(today());
      setJustLogged(true);
      onLogged();
      setTimeout(() => setJustLogged(false), 2500);
    } catch {
      setError("Couldn't log that symptom — the knowledge graph may be offline.");
    } finally {
      setLogging(false);
    }
  }

  return (
    <div
      className={[
        "rounded-2xl border p-6 sm:p-7",
        hasSignal ? "border-[#B5502E]/30 bg-surface-card" : "border-hairline bg-surface-card",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        {hasSignal ? (
          <AlertTriangle className="h-4 w-4 text-clay-alert" strokeWidth={1.75} />
        ) : (
          <Waypoints className="h-4 w-4 text-teal-deep" strokeWidth={1.75} />
        )}
        <p
          className={[
            "font-mono text-[11px] uppercase tracking-[0.14em]",
            hasSignal ? "text-clay-alert" : "text-stone",
          ].join(" ")}
        >
          Knowledge graph
        </p>
      </div>

      {graph.nodes.length === 0 ? (
        <p className="mt-3 text-[14px] leading-relaxed text-ink/70">
          Nothing logged yet. Symptoms you mention in Chat are picked up automatically, or log
          one directly below — the graph connects everything it sees.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[14px] leading-relaxed text-ink/80">
            {graph.nodes.length} symptom{graph.nodes.length === 1 ? "" : "s"} logged
            {graph.edges.length > 0 && (
              <>
                {" "}
                · {closePairs} pair{closePairs === 1 ? "" : "s"} within {CLOSE_WINDOW_DAYS} days
                of each other
              </>
            )}
            .
          </p>

          <div className="mt-4 flex justify-center">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="h-auto w-full max-w-[420px]"
              role="img"
              aria-label="Symptom knowledge graph — hover or tap a symptom or connection to reveal it"
              onClick={() => setActiveKey(null)}
            >
              {graph.edges.map((edge) => {
                const a = nodeById.get(edge.source);
                const b = nodeById.get(edge.target);
                if (!a || !b) return null;
                const close = edge.durationDays <= CLOSE_WINDOW_DAYS;
                const key = edgeKey(edge);
                const active = activeKey === key;
                return (
                  <g
                    key={key}
                    onMouseEnter={() => setActiveKey(key)}
                    onMouseLeave={() => setActiveKey((k) => (k === key ? null : k))}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveKey(key);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {/* wider invisible stroke so the edge is easy to hover/tap */}
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} />
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={close ? "#B5502E" : "#8A8677"}
                      strokeWidth={active ? (close ? 2.5 : 1.75) : close ? 1.75 : 1}
                      opacity={active ? 0.9 : close ? 0.6 : 0.28}
                    />
                    {active && (
                      <text
                        x={(a.x + b.x) / 2}
                        y={(a.y + b.y) / 2}
                        textAnchor="middle"
                        className="font-mono"
                        fontSize={9.5}
                        fill={close ? "#B5502E" : "#8A8677"}
                      >
                        {edge.durationDays}d
                      </text>
                    )}
                  </g>
                );
              })}

              {laidOut.map((node) => {
                const active = activeKey === node.id;
                return (
                  <g
                    key={node.id}
                    onMouseEnter={() => setActiveKey(node.id)}
                    onMouseLeave={() => setActiveKey((k) => (k === node.id ? null : k))}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveKey(node.id);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {/* wider invisible fill so the node is easy to hover/tap */}
                    <circle cx={node.x} cy={node.y} r={16} fill="transparent" />
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={active ? 7 : 5}
                      fill={hasSignal ? "#B5502E" : "#2F6E68"}
                      opacity={active ? 1 : 0.85}
                    />
                    {active && (
                      <>
                        <text
                          x={node.x}
                          y={node.y - 14}
                          textAnchor="middle"
                          className="font-medium"
                          fontSize={12}
                          fill="#2B2A26"
                        >
                          {node.label}
                        </text>
                        <text
                          x={node.x}
                          y={node.y + 22}
                          textAnchor="middle"
                          className="font-mono"
                          fontSize={9}
                          fill="#8A8677"
                        >
                          {node.date}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="mt-2 text-center text-[11px] text-stone">
            Hover or tap a symptom or connection to reveal its details.
          </p>
        </>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 flex flex-wrap items-center gap-2 border-t border-hairline pt-5"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Log a symptom…"
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-bg-mist px-3 py-2 text-[13px] text-ink placeholder:text-stone/60 focus:border-teal-deep focus:outline-none"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={today()}
          aria-label="Date"
          className="rounded-lg border border-hairline bg-bg-mist px-3 py-2 text-[13px] text-ink focus:border-teal-deep focus:outline-none"
        />
        <button
          type="submit"
          disabled={logging || !name.trim()}
          className="flex items-center gap-1.5 rounded-full bg-teal-deep px-4 py-2 text-[13px] font-medium text-bg-mist transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {logging ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          Log
        </button>
      </form>
      {justLogged && <p className="mt-2 text-[12px] text-teal-deep">Logged.</p>}
      {error && <p className="mt-2 text-[12px] text-clay-alert">{error}</p>}
    </div>
  );
}
