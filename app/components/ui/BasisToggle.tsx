import { useRevalidator, useRouteLoaderData } from "react-router";

import { BASIS_COOKIE, BASIS_KEYS, es, type Basis } from "~/lib";

import { SegmentedButtons } from "./Segmented";

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
    <SegmentedButtons
      label={es.basis.label}
      value={value}
      onSelect={select}
      segments={BASIS_KEYS.map((key) => ({
        key,
        label: LABELS[key],
        hint: HINTS[key],
      }))}
    />
  );
}
