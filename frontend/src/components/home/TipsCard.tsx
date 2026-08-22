import { Sparkle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface TipsCardProps {
  tip: string;
  heading?: string;
  icon?: LucideIcon;
  id?: string;
}

export function TipsCard({ tip, heading = "Today's tip", icon: Icon = Sparkle, id }: TipsCardProps) {
  return (
    <div
      id={id}
      className="flex flex-col rounded-2xl border border-hairline bg-surface-card p-6 sm:p-7"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-teal-deep" strokeWidth={1.75} />
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
          {heading}
        </p>
      </div>
      <p className="mt-4 flex-1 text-[15px] leading-relaxed text-ink/85">{tip}</p>
    </div>
  );
}
