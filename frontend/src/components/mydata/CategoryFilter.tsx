import type { ChatSourceKind } from "@/types";

interface CategoryFilterProps {
  value: ChatSourceKind | null;
  onChange: (kind: ChatSourceKind | null) => void;
}

const CATEGORIES: { kind: ChatSourceKind; label: string }[] = [
  { kind: "consultation", label: "Consultation" },
  { kind: "consult_prescription", label: "Consult + Prescription" },
  { kind: "prescription", label: "Prescription" },
  { kind: "report", label: "Reports" },
  { kind: "web", label: "Searches (web results)" },
];

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? (e.target.value as ChatSourceKind) : null)}
      aria-label="Filter by category"
      className="rounded-full border border-hairline bg-surface-card px-3.5 py-1.5 text-[13px] text-ink/80 transition-colors duration-150 hover:border-teal-deep/60 focus:outline-none"
    >
      <option value="">All categories</option>
      {CATEGORIES.map((c) => (
        <option key={c.kind} value={c.kind}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
