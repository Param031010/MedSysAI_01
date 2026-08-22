export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-3.5">
      <dt className="text-[13px] text-stone">{label}</dt>
      <dd className="font-mono text-[14px] text-ink">{value}</dd>
    </div>
  );
}
