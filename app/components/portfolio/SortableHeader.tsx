import { Link } from "react-router";

import { es, type SortDir } from "~/lib";

function SortArrow({ dir }: { dir: SortDir }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={dir === "asc" ? "rotate-180" : undefined}
    >
      <path d="M5 1.5v7M2 5.5l3 3 3-3" />
    </svg>
  );
}

export function SortableHeader({
  label,
  href,
  align,
  active,
  dir,
}: {
  label: string;
  href: string;
  align: "left" | "right";
  active: boolean;
  dir: SortDir;
}) {
  const copy = es.portfolio.sort;
  const state = active ? `, ${dir === "asc" ? copy.asc : copy.desc}` : "";
  return (
    <Link
      to={href}
      aria-label={`${copy.by(label)}${state}`}
      className={`inline-flex items-center gap-1 text-[11px] font-medium tracking-wide transition-colors hover:text-text ${
        align === "right" ? "justify-self-end" : "justify-self-start"
      } ${active ? "text-text" : "text-muted"}`}
    >
      <span>{label}</span>
      {active && <SortArrow dir={dir} />}
    </Link>
  );
}
