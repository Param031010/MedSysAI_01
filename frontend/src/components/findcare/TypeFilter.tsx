import type { FacilityType } from "@/types";

interface TypeFilterProps {
  value: FacilityType | null;
  onChange: (type: FacilityType | null) => void;
}

const OPTIONS: { value: FacilityType; label: string }[] = [
  { value: "hospital", label: "Hospitals" },
  { value: "clinic", label: "Clinics" },
  { value: "diagnostic_center", label: "Diagnostic centers" },
];

export function TypeFilter({ value, onChange }: TypeFilterProps) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? (e.target.value as FacilityType) : null)}
      aria-label="Filter by facility type"
      className="rounded-full border border-hairline bg-surface-card px-3.5 py-1.5 text-[13px] text-ink/80 transition-colors duration-150 hover:border-teal-deep/60 focus:outline-none"
    >
      <option value="">All facility types</option>
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
