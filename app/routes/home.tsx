import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Quoin" },
    { name: "description", content: "Personal investment platform" },
  ];
}

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-surface p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-md bg-text text-sm font-bold text-bg">
            F
          </span>
          <span className="text-lg font-semibold tracking-tight">Quoin</span>
        </div>
        <p className="mt-6 text-sm text-muted">
          Initial skeleton. Layered structure, design tokens and lint boundaries
          are in place. No business logic yet.
        </p>
        <div className="mt-6 flex items-center gap-4 text-sm">
          <span className="font-medium text-positive">+12.34%</span>
          <span className="font-medium text-negative">−4.56%</span>
          <span className="text-muted">€1,234.56</span>
        </div>
      </div>
    </main>
  );
}
