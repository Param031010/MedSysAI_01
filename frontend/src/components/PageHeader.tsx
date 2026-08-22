import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  meta?: string;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, meta, action }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 px-5 pt-8 sm:px-8 lg:pt-10">
      <div>
        {eyebrow && (
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[32px] leading-tight tracking-tight text-ink sm:text-[38px]">
          {title}
        </h1>
        {meta && (
          <p className="mt-2 font-mono text-[13px] text-stone">{meta}</p>
        )}
      </div>
      {action}
    </header>
  );
}
