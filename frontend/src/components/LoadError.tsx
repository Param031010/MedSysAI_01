import { RotateCw } from "lucide-react";

interface LoadErrorProps {
  message?: string;
  onRetry: () => void;
}

export function LoadError({ message = "Couldn't load this page.", onRetry }: LoadErrorProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-16 text-center sm:px-8">
      <p className="text-sm text-clay-alert">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-4 py-2 text-[13px] text-ink/80 transition-colors duration-150 hover:border-teal-deep/60"
      >
        <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} />
        Try again
      </button>
    </div>
  );
}
