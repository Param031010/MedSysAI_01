import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  Clock,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Waypoints,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { KnowledgeGraph } from "@/types";
import { deleteSymptom, listSymptoms, logSymptom, type SymptomLog } from "@/services/symptoms";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const CLOSE_WINDOW_DAYS = 7;
const SIZE = 480;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 80;

interface LaidOutNode {
  id: string;
  label: string;
  date: string;
  category?: string;
  description?: string;
  x: number;
  y: number;
  angle: number;
}

function layoutNodes(nodes: KnowledgeGraph["nodes"]): LaidOutNode[] {
  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ ...nodes[0], x: CENTER, y: CENTER, angle: 0 }];
  }
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      ...node,
      angle,
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    };
  });
}

interface KnowledgeGraphCardProps {
  graph: KnowledgeGraph;
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

  // Hover & Selection states
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Symptom logs history list
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>([]);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      const logs = await listSymptoms();
      setSymptomLogs(logs);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [graph]);

  const laidOut = useMemo(() => layoutNodes(graph.nodes), [graph.nodes]);
  const nodeById = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut]);

  const activeNodeId = selectedNodeId || hoveredNodeId;
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : null;
  const selectedEdge = useMemo(() => {
    if (!selectedEdgeKey) return null;
    return graph.edges.find((e) => edgeKey(e) === selectedEdgeKey) ?? null;
  }, [selectedEdgeKey, graph.edges]);

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
      await fetchLogs();
      setTimeout(() => setJustLogged(false), 2500);
    } catch {
      setError("Couldn't log symptom — please try again.");
    } finally {
      setLogging(false);
    }
  }

  async function handleDelete(symptomName: string) {
    if (deletingName) return;
    setDeletingName(symptomName);
    try {
      await deleteSymptom(symptomName);
      onLogged();
      await fetchLogs();
    } catch {
      setError(`Failed to delete ${symptomName}`);
    } finally {
      setDeletingName(null);
    }
  }

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.2, 2.0));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.2, 0.8));
  const handleResetZoom = () => setZoomLevel(1.0);

  return (
    <div
      className={[
        "rounded-2xl border p-6 sm:p-7 transition-colors shadow-sm",
        hasSignal ? "border-[#B5502E]/30 bg-surface-card" : "border-hairline bg-surface-card",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
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
            Clinical Knowledge Graph
          </p>
        </div>

        {/* Zoom Controls */}
        {graph.nodes.length > 0 && (
          <div className="flex items-center gap-1 bg-bg-mist border border-hairline rounded-lg p-1">
            <button
              onClick={handleZoomIn}
              title="Zoom In"
              className="p-1 rounded hover:bg-stone/10 text-stone transition-colors"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-1 rounded hover:bg-stone/10 text-stone transition-colors"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              title="Reset View"
              className="p-1 rounded hover:bg-stone/10 text-stone transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {graph.nodes.length === 0 ? (
        <p className="mt-3 text-[14px] leading-relaxed text-ink/70">
          Nothing logged yet. Symptoms mentioned in Chat are extracted automatically, or log one directly below to construct your clinical knowledge graph.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[14px] leading-relaxed text-ink/80">
            <span className="font-semibold text-ink">{graph.nodes.length}</span> symptom{graph.nodes.length === 1 ? "" : "s"} logged
            {graph.edges.length > 0 && (
              <>
                {" "}
                · <span className="font-semibold text-ink">{graph.edges.length}</span> relation{graph.edges.length === 1 ? "" : "s"} ({closePairs} acute pair{closePairs === 1 ? "" : "s"} within {CLOSE_WINDOW_DAYS} days)
              </>
            )}
            .
          </p>

          {/* Clean SVG Canvas Container */}
          <div className="relative mt-4 flex justify-center overflow-hidden rounded-xl border border-hairline bg-bg-canvas/50 p-2 sm:p-4">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="h-auto w-full max-w-[500px] transition-transform duration-200"
              style={{ transform: `scale(${zoomLevel})` }}
              role="img"
              aria-label="Symptom knowledge graph canvas"
              onClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeKey(null);
              }}
            >
              <defs>
                <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Render Connection Lines (Edges) */}
              {graph.edges.map((edge) => {
                const a = nodeById.get(edge.source);
                const b = nodeById.get(edge.target);
                if (!a || !b) return null;

                const close = edge.durationDays <= CLOSE_WINDOW_DAYS;
                const key = edgeKey(edge);
                const isSelected = selectedEdgeKey === key;
                const isHovered = hoveredEdgeKey === key;
                const isNodeActive = activeNodeId === edge.source || activeNodeId === edge.target;

                const showLabel = isSelected || isHovered || (selectedNodeId && isNodeActive);
                const strokeColor = isSelected || isHovered ? "#2F6E68" : close ? "#B5502E" : "#A39F93";
                const strokeWidth = isSelected || isHovered ? 2.5 : isNodeActive ? 2 : close ? 1.4 : 0.8;
                const opacity = isSelected || isHovered ? 1 : isNodeActive ? 0.85 : close ? 0.45 : 0.15;

                return (
                  <g
                    key={key}
                    onMouseEnter={() => setHoveredEdgeKey(key)}
                    onMouseLeave={() => setHoveredEdgeKey(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEdgeKey(key);
                      setSelectedNodeId(null);
                    }}
                    className="cursor-pointer"
                  >
                    {/* Hover hit target */}
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} />

                    {/* Clean edge line without scale jumps */}
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={isSelected ? "4 2" : undefined}
                      opacity={opacity}
                      style={{ transition: "stroke 0.15s, stroke-width 0.15s, opacity 0.15s" }}
                    />

                    {/* Edge Label Badge — ONLY visible on hover/selection to eliminate text clutter! */}
                    {showLabel && (
                      <g transform={`translate(${(a.x + b.x) / 2}, ${(a.y + b.y) / 2})`}>
                        <rect
                          x={-34}
                          y={-10}
                          width={68}
                          height={18}
                          rx={9}
                          fill={isSelected ? "#2F6E68" : "#FFFFFF"}
                          stroke={isSelected ? "#2F6E68" : "#D4D0C5"}
                          strokeWidth={1}
                          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}
                        />
                        <text
                          x={0}
                          y={3}
                          textAnchor="middle"
                          className="font-mono text-[9.5px] font-semibold"
                          fill={isSelected ? "#FFFFFF" : close ? "#113835" : "#2B2A26"}
                        >
                          {`${edge.durationDays}d gap`}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Render Nodes — In-place expansion around center (NO displacement) */}
              {laidOut.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const r = isSelected ? 11 : isHovered ? 9.5 : 7.5;

                // Smart label offset calculation so text stays clean
                const isTopHalf = node.y < CENTER;
                const textY = isTopHalf ? node.y - (r + 8) : node.y + (r + 16);
                const dateY = isTopHalf ? node.y - (r + 20) : node.y + (r + 28);

                return (
                  <g
                    key={node.id}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      setSelectedEdgeKey(null);
                    }}
                    className="cursor-pointer"
                  >
                    {/* Invisible hit box */}
                    <circle cx={node.x} cy={node.y} r={24} fill="transparent" />

                    {/* Glowing outer ring on hover/select */}
                    {(isSelected || isHovered) && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r + 6}
                        fill={isSelected ? "#2F6E68" : "#B5502E"}
                        opacity={0.2}
                        filter="url(#nodeGlow)"
                      />
                    )}

                    {/* Core Node Circle — Fixed position, expands cleanly in-place */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={isSelected ? "#2F6E68" : isHovered ? "#2F6E68" : hasSignal ? "#B5502E" : "#2F6E68"}
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      style={{ transition: "r 0.15s ease-out, fill 0.15s ease-out" }}
                    />

                    {/* Node Text Label */}
                    <text
                      x={node.x}
                      y={textY}
                      textAnchor="middle"
                      className={[
                        "text-[11px] font-medium transition-colors",
                        isSelected || isHovered ? "fill-ink font-semibold" : "fill-ink/90",
                      ].join(" ")}
                    >
                      {node.label}
                    </text>

                    {/* Date Subtitle */}
                    <text
                      x={node.x}
                      y={dateY}
                      textAnchor="middle"
                      className="font-mono text-[9px] fill-stone/70"
                    >
                      {node.date}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Instruction overlay */}
            {!selectedNode && !selectedEdge && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-surface-card/90 px-3 py-1 text-[11px] text-stone backdrop-blur border border-hairline shadow-sm pointer-events-none">
                Hover or click any node/connection to reveal relationships
              </div>
            )}
          </div>

          {/* Node Inspection Popover Card */}
          {selectedNode && (
            <div className="mt-4 rounded-xl border border-teal-deep/30 bg-teal-deep/5 p-4 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Activity className="h-4 w-4 text-teal-deep" />
                  <h4 className="font-semibold text-[14px] text-ink">{selectedNode.label}</h4>
                  {selectedNode.category && (
                    <span className="rounded-full bg-teal-deep/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-teal-deep uppercase tracking-wider">
                      {selectedNode.category}
                    </span>
                  )}
                  <span className="rounded-full bg-stone/10 px-2 py-0.5 font-mono text-[10px] font-medium text-stone">
                    {selectedNode.date}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="rounded p-1 text-stone hover:bg-stone/10 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-2 text-[12.5px] text-ink/80">
                <p>
                  <strong className="text-ink">Clinical Description:</strong>{" "}
                  {selectedNode.description ||
                    `Active patient symptom logged on ${selectedNode.date}. Evaluated against temporal and clinical co-occurrence patterns.`}
                </p>

                <div>
                  <strong className="text-ink">Connected Relationships:</strong>
                  <ul className="mt-1.5 space-y-1.5 pl-3 list-disc">
                    {graph.edges
                      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                      .map((e) => {
                        const otherId = e.source === selectedNode.id ? e.target : e.source;
                        const otherNode = nodeById.get(otherId);
                        return (
                          <li key={edgeKey(e)}>
                            <span className="font-semibold text-ink">{otherNode?.label || otherId}</span> —{" "}
                            <span className="font-mono text-teal-deep font-medium">{e.relation || "co-occurs with"}</span> ({e.durationDays}d gap)
                          </li>
                        );
                      })}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Edge Inspection Popover Card */}
          {selectedEdge && (() => {
            const src = nodeById.get(selectedEdge.source);
            const tgt = nodeById.get(selectedEdge.target);
            return (
              <div className="mt-4 rounded-xl border border-clay-alert/30 bg-clay-alert/5 p-4 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Info className="h-4 w-4 text-clay-alert" />
                    <h4 className="font-semibold text-[14px] text-ink">
                      {src?.label} <span className="text-stone">↔</span> {tgt?.label}
                    </h4>
                    <span className="rounded-full bg-clay-alert/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-clay-alert uppercase tracking-wider">
                      {selectedEdge.relation || "Clinical Co-occurrence"}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedEdgeKey(null)}
                    className="rounded p-1 text-stone hover:bg-stone/10 hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 space-y-2 text-[12.5px] text-ink/80">
                  <p>
                    <strong className="text-ink">Temporal Proximity:</strong> Logged within{" "}
                    <span className="font-semibold text-ink">{selectedEdge.durationDays} day(s)</span> of each other.
                  </p>
                  <p>
                    <strong className="text-ink">Specific Clinical Rationale:</strong>{" "}
                    {selectedEdge.rationale ||
                      `Co-occurrence of ${src?.label} and ${tgt?.label} within ${selectedEdge.durationDays} day(s) flags potential shared pathophysiological triggers or systemic progression.`}
                  </p>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Log Input Form */}
      <form
        onSubmit={handleSubmit}
        className="mt-6 flex flex-wrap items-center gap-2 border-t border-hairline pt-5"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Log a symptom (e.g. Fever, Headache)…"
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
      {justLogged && <p className="mt-2 text-[12px] text-teal-deep">Logged successfully.</p>}
      {error && <p className="mt-2 text-[12px] text-clay-alert">{error}</p>}

      {/* Symptom Logs History Section */}
      <div className="mt-7 border-t border-hairline pt-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-stone" />
            <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
              Logged Symptoms Timeline ({symptomLogs.length})
            </h3>
          </div>
        </div>

        {symptomLogs.length === 0 ? (
          <p className="text-[13px] text-stone italic">No symptom logs on record yet.</p>
        ) : (
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {symptomLogs.map((log) => (
              <div
                key={`${log.name}-${log.date}`}
                className="flex items-center justify-between rounded-lg border border-hairline bg-bg-mist/60 px-3.5 py-2.5 text-[13px] transition-colors hover:bg-bg-mist"
              >
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-teal-deep" />
                  <div>
                    <p className="font-medium text-ink capitalize">{log.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-stone font-mono mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {log.date}
                      </span>
                      {log.loggedAt && (
                        <span>
                          · {new Date(log.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(log.name)}
                  disabled={deletingName === log.name}
                  title="Delete symptom log"
                  className="rounded p-1 text-stone hover:bg-clay-alert/10 hover:text-clay-alert transition-colors disabled:opacity-50"
                >
                  {deletingName === log.name ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


