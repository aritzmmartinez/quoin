import { z } from "zod";

import type { Instrument } from "./ledger";

export const leafKindSchema = z.enum([
  "COMPANY",
  "COMMODITY",
  "CRYPTO",
  "UNRESOLVED",
]);
export type LeafKind = z.infer<typeof leafKindSchema>;

export interface LeafId {
  kind: LeafKind;
  id: string;
}

export function leafKey(leaf: LeafId): string {
  return `${leaf.kind}:${leaf.id}`;
}

export interface WeightedLeaf {
  leaf: LeafId;
  name: string;
  weight: string;
}

export const exposureKindSchema = z.enum([
  "COMPANY",
  "EQUITY_FUND",
  "BOND_FUND",
  "COMMODITY",
  "CRYPTO",
]);
export type ExposureKind = z.infer<typeof exposureKindSchema>;

export const KINDS_NEEDING_LEAF: readonly ExposureKind[] = [
  "COMMODITY",
  "CRYPTO",
];

export function resolveIntrinsic(instrument: Instrument): WeightedLeaf[] {
  const one = (kind: LeafKind, id: string): WeightedLeaf[] => [
    { leaf: { kind, id }, name: instrument.name, weight: "1" },
  ];

  const explicit = instrument.exposureKind;
  const leafId = instrument.exposureLeafId ?? instrument.id;

  if (explicit === "COMPANY") return one("COMPANY", leafId);
  if (explicit === "COMMODITY") return one("COMMODITY", leafId);
  if (explicit === "CRYPTO") return one("CRYPTO", leafId);
  if (explicit === "EQUITY_FUND" || explicit === "BOND_FUND") {
    return one("UNRESOLVED", instrument.id);
  }

  switch (instrument.type) {
    case "STOCK":
      return one("COMPANY", instrument.id);
    case "CRYPTO":
      return one("CRYPTO", instrument.id);
    case "COMMODITY":
      return one("COMMODITY", instrument.id);
    default:
      return one("UNRESOLVED", instrument.id);
  }
}
