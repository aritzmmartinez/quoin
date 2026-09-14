import { Moon } from "lucide-react";

import type { Route } from "./+types/settings";

import { ThemeSetting } from "~/components";
import { es } from "~/lib";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Ajustes · Quoin" },
    {
      name: "description",
      content: "Cómo se muestra Quoin en este dispositivo",
    },
  ];
}

export const handle = { title: es.settings.title };

export default function Settings() {
  const s = es.settings;

  return (
    <div
      className="grid items-start gap-x-8 gap-y-6 py-6"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
      }}
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-[14px] font-semibold">{s.appearance.title}</h2>
        <p className="text-[12px] leading-relaxed text-muted">
          {s.appearance.desc}
        </p>
      </div>

      <div className="min-w-0 rounded-card border border-border bg-surface">
        <div className="flex min-h-14 flex-wrap items-center gap-4 px-4 py-3">
          <Moon
            size={18}
            strokeWidth={1.75}
            aria-hidden
            className="text-muted"
          />
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-[13px] font-medium">{es.theme.label}</span>
            <span className="text-[11px] text-muted">
              {s.appearance.themeHint}
            </span>
          </div>
          <ThemeSetting />
        </div>
      </div>
    </div>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
