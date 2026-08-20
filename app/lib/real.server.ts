import { PrismaInflationRepository } from "~/adapters/persistence";
import { InflationIndex, type LedgerEvent, type Revalue } from "~/core/domain";
import { realBasis } from "~/core/projections";

import { parseBasis, type Basis } from "./basis";

/**
 * The series every screen deflates with. National by default — a foral portfolio
 * is taxed in Bizkaia but its purchasing power is not confined to it, and the
 * national index is the one every published real return is quoted against.
 * Bizkaia is synced alongside it so the comparison is one query away.
 */
export const DEFAULT_INFLATION_SERIES = "ES";

export interface RealView {
  basis: Basis;
  active: boolean;
  reference: string | null;
  missing: string[];
  hasIndex: boolean;
  syncedAt: string | null;
  revalue?: Revalue;
}

const NOMINAL = (basis: Basis): RealView => ({
  basis,
  active: false,
  reference: null,
  missing: [],
  hasIndex: true,
  syncedAt: null,
});

export async function resolveRealView(
  request: Request,
  events: readonly LedgerEvent[],
): Promise<RealView> {
  const basis = parseBasis(request.headers.get("Cookie"));
  if (basis === "nominal") return NOMINAL(basis);

  const repository = new PrismaInflationRepository();
  const [points, syncedAt] = await Promise.all([
    repository.list(DEFAULT_INFLATION_SERIES),
    repository.lastSyncedAt(DEFAULT_INFLATION_SERIES),
  ]);
  const index = InflationIndex.from(DEFAULT_INFLATION_SERIES, points);

  if (index.size === 0) {
    return { ...NOMINAL(basis), hasIndex: false };
  }

  const resolved = realBasis(index, events);
  if (!resolved.ok) {
    return {
      basis,
      active: false,
      reference: resolved.reference,
      missing: resolved.missing,
      hasIndex: true,
      syncedAt: syncedAt?.toISOString() ?? null,
    };
  }

  return {
    basis,
    active: true,
    reference: resolved.reference,
    missing: [],
    hasIndex: true,
    syncedAt: syncedAt?.toISOString() ?? null,
    revalue: resolved.revalue,
  };
}
