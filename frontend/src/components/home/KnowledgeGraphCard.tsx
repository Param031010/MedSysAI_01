import { useEffect, useMemo, useRef, useState } from "react";
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
  Search,
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

export type LayoutMode = "radial" | "timeline" | "cluster";
export type TimeFilterMode = "all" | "acute";

interface LaidOutNode {
  id: string;
  label: string;
  date: string;
  category?: string;
  description?: string;
  frequency?: number;
  occurrences?: string[];
  x: number;
  y: number;
  angle: number;
}

export function getCategoryColor(category?: string) {
  const cat = (category || "").toLowerCase();
  if (cat.includes("neuro") || cat.includes("cognit") || cat.includes("vestib")) {
    return { fill: "#6366F1", stroke: "#4F46E5", badgeBg: "bg-indigo-500/15", badgeText: "text-indigo-600", label: "Neurological" };
  }
  if (cat.includes("cardio") || cat.includes("heart") || cat.includes("vascular")) {
    return { fill: "#E11D48", stroke: "#BE123C", badgeBg: "bg-rose-500/15", badgeText: "text-rose-600", label: "Cardiovascular" };
  }
  if (cat.includes("respirat") || cat.includes("lung") || cat.includes("breath")) {
    return { fill: "#0D9488", stroke: "#0F766E", badgeBg: "bg-teal-500/15", badgeText: "text-teal-600", label: "Respiratory" };
  }
  if (cat.includes("gastro") || cat.includes("stomach") || cat.includes("digest")) {
    return { fill: "#059669", stroke: "#047857", badgeBg: "bg-emerald-500/15", badgeText: "text-emerald-600", label: "Gastrointestinal" };
  }
  if (cat.includes("muscul") || cat.includes("joint") || cat.includes("bone")) {
    return { fill: "#D97706", stroke: "#B45309", badgeBg: "bg-amber-500/15", badgeText: "text-amber-600", label: "Musculoskeletal" };
  }
  if (cat.includes("system") || cat.includes("endocrin") || cat.includes("fever") || cat.includes("sweat")) {
    return { fill: "#8B5CF6", stroke: "#7C3AED", badgeBg: "bg-violet-500/15", badgeText: "text-violet-600", label: "Systemic" };
  }
  return { fill: "#2F6E68", stroke: "#113835", badgeBg: "bg-teal-500/15", badgeText: "text-teal-600", label: "General" };
}

function layoutNodes(nodes: KnowledgeGraph["nodes"]): LaidOutNode[] {
  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ ...nodes[0], x: CENTER, y: CENTER, angle: 0 }];
  }

  // Default Radial Ring (360 degrees)
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

function edgeKey(edge: KnowledgeGraph["edges"][number]): string {
  return `${edge.source}→${edge.target}`;
}

export function KnowledgeGraphCard({
  graph,
  hasSignal,
  onLogged,
}: {
  graph: KnowledgeGraph;
  hasSignal?: boolean;
  onLogged: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(today());
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState(false);

  // Customization States
  const [timeFilter, setTimeFilter] = useState<TimeFilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

  // Click Outside Deselection
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setSelectedNodeId(null);
        setSelectedEdgeKey(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const laidOut = useMemo(() => layoutNodes(graph.nodes), [graph.nodes]);
  const nodeById = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut]);

  // Filter Edges by Time Horizon
  const displayEdges = useMemo(() => {
    if (timeFilter === "acute") {
      return graph.edges.filter((e) => e.durationDays <= CLOSE_WINDOW_DAYS);
    }
    return graph.edges;
  }, [graph.edges, timeFilter]);

  const activeNodeId = selectedNodeId || hoveredNodeId;
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : null;
  const selectedEdge = useMemo(() => {
    if (!selectedEdgeKey) return null;
    return graph.edges.find((e) => edgeKey(e) === selectedEdgeKey) ?? null;
  }, [selectedEdgeKey, graph.edges]);

  const closePairs = graph.edges.filter((e) => e.durationDays <= CLOSE_WINDOW_DAYS).length;

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
      ref={cardRef}
      className={[
        "rounded-2xl border p-6 sm:p-7 transition-colors shadow-sm",
        hasSignal ? "border-[#B5502E]/30 bg-surface-card" : "border-hairline bg-surface-card",
      ].join(" ")}
    >
      {/* Top Header & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          {/* Customization Toolbar Bar: Search, Time Filter, Layout Switcher */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone" />
              <input
                type="text"
                placeholder="Search symptom (e.g. Chest)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-bg-mist/80 pl-8 pr-3 py-1.5 text-[12px] text-ink placeholder:text-stone focus:border-teal-deep focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone hover:text-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Time Horizon Filter */}
            <div className="flex items-center gap-1 rounded-lg border border-hairline bg-bg-mist/60 p-0.5 text-[11px] font-mono">
              <button
                onClick={() => setTimeFilter("all")}
                className={[
                  "rounded-md px-2.5 py-1 transition-colors",
                  timeFilter === "all" ? "bg-teal-deep text-white font-semibold shadow-xs" : "text-stone hover:text-ink",
                ].join(" ")}
              >
                All ({graph.edges.length})
              </button>
              <button
                onClick={() => setTimeFilter("acute")}
                className={[
                  "rounded-md px-2.5 py-1 transition-colors",
                  timeFilter === "acute" ? "bg-[#B5502E] text-white font-semibold shadow-xs" : "text-stone hover:text-ink",
                ].join(" ")}
              >
                Acute ≤7d ({closePairs})
              </button>
            </div>
          </div>

          {/* Category Color Legend Bar */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-stone">
            <span className="font-mono text-[10px] uppercase tracking-wider text-stone/80">Body Systems:</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Neurological</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Cardiovascular</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-500" /> Respiratory</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Gastrointestinal</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Musculoskeletal</span>
          </div>

          {/* SVG Canvas Container */}
          <div className="relative mt-3 flex justify-center overflow-hidden rounded-xl border border-hairline bg-bg-canvas/50 p-2 sm:p-4">
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

              {/* Render Connection Lines (Edges as Curved Bezier Arcs) */}
              {displayEdges.map((edge) => {
                const a = nodeById.get(edge.source);
                const b = nodeById.get(edge.target);
                if (!a || !b) return null;

                const close = edge.durationDays <= CLOSE_WINDOW_DAYS;
                const key = edgeKey(edge);
                const isSelected = selectedEdgeKey === key;
                const isHovered = hoveredEdgeKey === key;
                const isNodeActive = activeNodeId === edge.source || activeNodeId === edge.target;

                // CLICKABILITY RULE: If a node is selected, ONLY connected edges are clickable!
                const isClickable = !selectedNodeId || isNodeActive;

                const showLabel = isSelected || isHovered || (selectedNodeId && isNodeActive);
                const strokeColor = isSelected || isHovered ? "#2F6E68" : isNodeActive ? "#2F6E68" : close ? "#B5502E" : "#8A8578";
                const strokeWidth = isSelected || isHovered ? 3.0 : isNodeActive ? 2.5 : close ? 1.4 : 0.8;

                // HIDE unconnected edges when a node is selected
                const opacity = isSelected || isHovered ? 1.0 : isNodeActive ? 0.95 : selectedNodeId ? 0 : close ? 0.35 : 0.15;

                // Quadratic Bezier Curve Calculation
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const vx = mx - CENTER;
                const vy = my - CENTER;
                const dist = Math.sqrt(vx * vx + vy * vy) || 1;
                const ux = vx / dist;
                const uy = vy / dist;
                const curveAmount = 28 * (1 - Math.min(dist / RADIUS, 1));
                const cx = mx + ux * curveAmount;
                const cy = my + uy * curveAmount;

                const pathD = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
                const badgeX = 0.25 * a.x + 0.5 * cx + 0.25 * b.x;
                const badgeY = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;

                return (
                  <g
                    key={key}
                    onMouseEnter={() => isClickable && setHoveredEdgeKey(key)}
                    onMouseLeave={() => isClickable && setHoveredEdgeKey(null)}
                    onClick={(e) => {
                      if (!isClickable) return;
                      e.stopPropagation();
                      setSelectedEdgeKey(key);
                    }}
                    style={{ pointerEvents: isClickable ? "auto" : "none" }}
                    className={isClickable ? "cursor-pointer" : "cursor-default"}
                  >
                    <path d={pathD} fill="none" stroke="transparent" strokeWidth={16} />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={isSelected ? "4 2" : undefined}
                      opacity={opacity}
                      style={{ transition: "stroke 0.15s, stroke-width 0.15s, opacity 0.15s" }}
                    />

                    {/* Edge Label Badge */}
                    {showLabel && (
                      <g transform={`translate(${badgeX}, ${badgeY})`}>
                        <rect
                          x={-36}
                          y={-10}
                          width={72}
                          height={18}
                          rx={9}
                          fill={isSelected ? "#2F6E68" : "#FFFFFF"}
                          stroke={isSelected ? "#2F6E68" : "#D4D0C5"}
                          strokeWidth={1}
                          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.12))" }}
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

              {/* Render Nodes with Body System Category Colors */}
              {laidOut.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isSearchMatch = searchQuery ? node.label.toLowerCase().includes(searchQuery.toLowerCase()) : false;
                const isSearchDimmed = searchQuery ? !isSearchMatch : false;

                const r = isSelected ? 11 : isHovered ? 9.5 : isSearchMatch ? 9 : 7.5;
                const catColor = getCategoryColor(node.category);

                // Angle-based Label Position
                const angle = Math.atan2(node.y - CENTER, node.x - CENTER);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                let textAnchor: "start" | "end" | "middle" = "middle";
                let textX = node.x;
                let textY = node.y;
                let dateY = node.y;

                if (sin < -0.7) {
                  textAnchor = "middle";
                  textX = node.x;
                  textY = node.y - (r + 8);
                  dateY = node.y - (r + 19);
                } else if (sin > 0.7) {
                  textAnchor = "middle";
                  textX = node.x;
                  textY = node.y + (r + 16);
                  dateY = node.y + (r + 27);
                } else if (cos > 0) {
                  textAnchor = "start";
                  textX = node.x + (r + 10);
                  textY = node.y - 1;
                  dateY = node.y + 11;
                } else {
                  textAnchor = "end";
                  textX = node.x - (r + 10);
                  textY = node.y - 1;
                  dateY = node.y + 11;
                }

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
                    opacity={isSearchDimmed ? 0.25 : 1.0}
                    className="cursor-pointer"
                  >
                    <circle cx={node.x} cy={node.y} r={24} fill="transparent" />

                    {(isSelected || isHovered || isSearchMatch) && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r + 6}
                        fill={catColor.fill}
                        opacity={0.25}
                        filter="url(#nodeGlow)"
                      />
                    )}

                    {/* Core Body-System Colored Node Circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={catColor.fill}
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      style={{ transition: "r 0.15s ease-out, fill 0.15s ease-out" }}
                    />

                    {/* Node Text Label */}
                    <text
                      x={textX}
                      y={textY}
                      textAnchor={textAnchor}
                      className={[
                        "text-[11px] font-medium transition-colors",
                        isSelected || isHovered || isSearchMatch ? "fill-ink font-semibold" : "fill-ink/90",
                      ].join(" ")}
                    >
                      {node.label}
                    </text>

                    {/* Date Subtitle */}
                    <text
                      x={textX}
                      y={dateY}
                      textAnchor={textAnchor}
                      className="font-mono text-[9px] fill-stone/70"
                    >
                      {node.date}
                    </text>
                  </g>
                );
              })}
            </svg>

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
                    <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${getCategoryColor(selectedNode.category).badgeBg} ${getCategoryColor(selectedNode.category).badgeText}`}>
                      {selectedNode.category}
                    </span>
                  )}
                  <span className="rounded-full bg-stone/10 px-2 py-0.5 font-mono text-[10px] font-medium text-stone">
                    {selectedNode.date}
                  </span>
                  {selectedNode.frequency && (
                    <span className="rounded-full bg-amber-500/20 text-amber-800 px-2.5 py-0.5 font-mono text-[10px] font-semibold border border-amber-500/30">
                      Logged {selectedNode.frequency}x
                    </span>
                  )}
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
                  <strong className="text-ink">Connected Relationships (Click to Inspect):</strong>
                  <ul className="mt-1.5 space-y-1.5 pl-3 list-disc">
                    {graph.edges
                      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                      .map((e) => {
                        const otherId = e.source === selectedNode.id ? e.target : e.source;
                        const otherNode = nodeById.get(otherId);
                        const k = edgeKey(e);
                        return (
                          <li
                            key={k}
                            onClick={() => {
                              setSelectedEdgeKey(k);
                            }}
                            className="cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-teal-deep/10 text-teal-deep hover:underline"
                          >
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
                    {selectedEdge.rationale || "Clinical relationship evaluation pending dynamic AI analysis."}
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
          placeholder="Log a symptom (e.g. Headache)..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-[180px] flex-1 rounded-lg border border-hairline bg-bg-mist px-3 py-2 text-[13px] text-ink placeholder:text-stone focus:border-teal-deep focus:outline-none"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-hairline bg-bg-mist px-3 py-2 text-[13px] text-ink focus:border-teal-deep focus:outline-none"
        />
        <button
          type="submit"
          disabled={logging || !name.trim()}
          className="flex items-center gap-1.5 rounded-full bg-teal-deep px-4 py-2 text-[13px] font-medium text-bg-mist transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
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
                          · {new Date(log.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(log.name)}
                  disabled={deletingName === log.name}
                  title="Delete symptom log"
                  className="rounded p-1 text-stone hover:bg-clay-alert/10 hover:text-clay-alert transition-colors disabled:opacity-50 cursor-pointer"
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
