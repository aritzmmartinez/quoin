import { isObsoleteRegion } from "~/adapters/ingestion/holdings/venue";
import { venueOf } from "~/adapters/identity/openfigi/venues";
import type { EtfHolding } from "~/core/ports";

export function hasObsoleteVenue(holdings: readonly EtfHolding[]): boolean {
  return holdings.some((h) => {
    if (h.identityKind !== "TICKER") return false;
    const venue = venueOf(h.identity);
    return venue !== null && isObsoleteRegion(venue);
  });
}
