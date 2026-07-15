import { Card } from "./Card";

export function StatTile({
  label,
  value,
  sub,
  valueClass = "",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div
        className={`mt-1 text-[18px] font-semibold tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </Card>
  );
}
