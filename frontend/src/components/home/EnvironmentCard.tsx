import { CloudFog, Droplets } from "lucide-react";
import type { EnvironmentSnapshot } from "@/types";

interface EnvironmentCardProps {
  data: EnvironmentSnapshot;
  id?: string;
}

function aqiTone(aqi: number): string {
  if (aqi <= 50) return "#2F6E68";
  if (aqi <= 100) return "#7C7568";
  return "#B5502E";
}

export function EnvironmentCard({ data, id }: EnvironmentCardProps) {
  return (
    <div
      id={id}
      className="rounded-2xl border border-hairline bg-surface-card p-6 sm:p-7"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            Environment
          </p>
          <p className="mt-1 text-[15px] text-ink/80">{data.locationName}</p>
        </div>
        <CloudFog className="h-5 w-5 text-stone" strokeWidth={1.5} />
      </div>

      <div className="mt-5 flex items-end gap-6">
        <div>
          <div className="font-mono text-[40px] leading-none text-ink">
            {data.tempC}°
          </div>
          <p className="mt-1 text-[13px] text-stone">{data.condition}</p>
        </div>
        <div className="flex items-center gap-1.5 pb-1 text-[13px] text-stone">
          <Droplets className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="font-mono">{data.humidityPct}%</span>
        </div>
        <div className="ml-auto pb-1 text-right">
          <div
            className="font-mono text-[28px] leading-none"
            style={{ color: aqiTone(data.aqi) }}
          >
            {data.aqi}
          </div>
          <p className="mt-1 text-[12px] text-stone">{data.aqiCategory} AQI</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {data.pollutants.map((p) => (
          <div
            key={p.label}
            className="rounded-lg border border-hairline bg-bg-mist px-2 py-2 text-center"
          >
            <p className="font-mono text-[13px] text-ink">{p.value}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-stone">
              {p.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
