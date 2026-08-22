import type { ModelStatus } from "@/types";

export function ModelIndicator({ status }: { status: ModelStatus | null }) {
  if (!status) {
    return (
      <span className="font-mono text-[12px] text-stone/60">checking model…</span>
    );
  }

  const providerLabel = status.provider === "ollama" ? "Ollama" : "Groq";

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-stone">
      <span
        className={[
          "h-1.5 w-1.5 rounded-full",
          status.reachable ? "bg-teal-deep" : "bg-clay-alert",
        ].join(" ")}
      />
      {providerLabel} · {status.model}
    </span>
  );
}
