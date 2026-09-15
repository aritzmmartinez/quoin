import { useRevalidator, useRouteLoaderData } from "react-router";

import { type Basis, BASIS_COOKIE, BASIS_KEYS, useCopy } from "~/lib";

import { SegmentedButtons } from "./Segmented";

const ONE_YEAR = 60 * 60 * 24 * 365;

type RootData = { basis?: Basis };

export function BasisToggle() {
  const t = useCopy();
  const labels: Record<Basis, string> = {
    nominal: t.basis.nominal,
    real: t.basis.real,
  };
  const hints: Record<Basis, string> = {
    nominal: t.basis.nominalHint,
    real: t.basis.realHint,
  };
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
      label={t.basis.label}
      value={value}
      onSelect={select}
      segments={BASIS_KEYS.map((key) => ({
        key,
        label: labels[key],
        hint: hints[key],
      }))}
    />
  );
}
