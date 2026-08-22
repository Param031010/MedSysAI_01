interface SpecialtyChipsProps {
  specialties: string[];
  active: string | null;
  onChange: (specialty: string | null) => void;
}

export function SpecialtyChips({ specialties, active, onChange }: SpecialtyChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip label="All" active={active === null} onClick={() => onChange(null)} />
      {specialties.map((s) => (
        <Chip key={s} label={s} active={active === s} onClick={() => onChange(s)} />
      ))}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3.5 py-1.5 text-[13px] transition-colors duration-150",
        active
          ? "border-teal-deep bg-teal-deep text-bg-mist"
          : "border-hairline bg-surface-card text-ink/80 hover:border-teal-deep/60",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
