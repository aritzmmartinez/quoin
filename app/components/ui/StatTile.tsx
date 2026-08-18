import { Link } from "react-router";

import { Card } from "./Card";

export function StatTile({
  label,
  value,
  sub,
  valueClass = "",
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  to?: string;
}) {
  const body = (
    <>
      <div className="text-[11px] text-muted">{label}</div>
      <div
        className={`mt-1 text-[18px] font-semibold tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </>
  );

  if (!to) return <Card className="px-4 py-3.5">{body}</Card>;

  return (
    <Card className="transition-colors hover:bg-surface-2">
      <Link to={to} className="block px-4 py-3.5">
        {body}
      </Link>
    </Card>
  );
}
