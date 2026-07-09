import { Link } from "react-router";

import type { SortDir } from "~/lib";

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
  const state = active
    ? dir === "asc"
      ? ", orden ascendente"
      : ", orden descendente"
    : "";
  return (
    <Link
      to={href}
      aria-label={`Ordenar por ${label}${state}`}
      className={`inline-flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted transition-colors hover:text-text ${
        align === "right" ? "justify-self-end" : "justify-self-start"
      }`}
    >
      <span>{label}</span>
      {active && <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span>}
    </Link>
  );
}
