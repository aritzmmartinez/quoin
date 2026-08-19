import { useRevalidator, useRouteLoaderData } from "react-router";

import { BASIS_COOKIE, BASIS_KEYS, es, type Basis } from "~/lib";

const ONE_YEAR = 60 * 60 * 24 * 365;

const LABELS: Record<Basis, string> = {
  nominal: es.basis.nominal,
  real: es.basis.real,
};

const HINTS: Record<Basis, string> = {
  nominal: es.basis.nominalHint,
  real: es.basis.realHint,
};

type RootData = { basis?: Basis };

export function BasisToggle() {
  const root = useRouteLoaderData("root") as RootData | undefined;
  const value: Basis = root?.basis ?? "nominal";
  const revalidator = useRevalidator();

  function select(next: Basis) {
    if (next === value) return;
    document.cookie = `${BASIS_COOKIE}=${next};path=/;max-age=${ONE_YEAR};samesite=lax`;
    void revalidator.revalidate();
  }

  return (
    <div
      role="group"
      aria-label={es.basis.label}
      className="inline-flex rounded-lg border border-border p-0.5"
    >
      {BASIS_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => select(key)}
          aria-pressed={value === key}
          title={HINTS[key]}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
            value === key
              ? "bg-surface-2 text-text"
              : "text-muted hover:text-text"
          }`}
        >
          {LABELS[key]}
        </button>
      ))}
    </div>
  );
}
