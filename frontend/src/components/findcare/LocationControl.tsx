import { LocateFixed, Loader2, MapPinned, X } from "lucide-react";

export type RadiusKm = 5 | 10 | 20;

interface LocationControlProps {
  hasLocation: boolean;
  locating: boolean;
  error: string | null;
  radius: RadiusKm | null;
  pinMode: boolean;
  onCapture: () => void;
  onClear: () => void;
  onStartPinMode: () => void;
  onCancelPinMode: () => void;
  onRadiusChange: (radius: RadiusKm | null) => void;
}

export function LocationControl({
  hasLocation,
  locating,
  error,
  radius,
  pinMode,
  onCapture,
  onClear,
  onStartPinMode,
  onCancelPinMode,
  onRadiusChange,
}: LocationControlProps) {
  if (pinMode) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-teal-deep bg-teal-deep/10 px-3.5 py-1.5 text-[13px] text-teal-deep">
          <MapPinned className="h-3.5 w-3.5" strokeWidth={1.75} />
          Click the map to set your location
        </span>
        <button
          type="button"
          onClick={onCancelPinMode}
          className="rounded-full border border-hairline bg-surface-card px-3.5 py-1.5 text-[13px] text-ink/80 transition-colors duration-150 hover:border-teal-deep/60"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasLocation ? (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-full border border-teal-deep bg-teal-deep px-3.5 py-1.5 text-[13px] text-bg-mist transition-colors duration-150"
        >
          <LocateFixed className="h-3.5 w-3.5" strokeWidth={1.75} />
          Using your location
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onCapture}
          disabled={locating}
          className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3.5 py-1.5 text-[13px] text-ink/80 transition-colors duration-150 hover:border-teal-deep/60 disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {locating ? "Locating…" : "Use my location"}
        </button>
      )}

      <button
        type="button"
        onClick={onStartPinMode}
        title="If the auto-detected location is wrong, set it yourself"
        className="flex items-center gap-1 text-[12px] text-stone underline-offset-2 hover:text-ink hover:underline"
      >
        <MapPinned className="h-3.5 w-3.5" strokeWidth={1.75} />
        Not accurate? Set manually
      </button>

      <select
        value={radius ?? ""}
        onChange={(e) => onRadiusChange(e.target.value ? (Number(e.target.value) as RadiusKm) : null)}
        aria-label="Filter by distance"
        className="rounded-full border border-hairline bg-surface-card px-3.5 py-1.5 text-[13px] text-ink/80 transition-colors duration-150 hover:border-teal-deep/60 focus:outline-none"
      >
        <option value="">Any distance</option>
        <option value={5}>Within 5 km</option>
        <option value={10}>Within 10 km</option>
        <option value={20}>Within 20 km</option>
      </select>

      {error && <p className="text-[12px] text-clay-alert">{error}</p>}
    </div>
  );
}
