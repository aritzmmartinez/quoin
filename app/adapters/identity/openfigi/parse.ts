import type { IdentityResolution, RawIdentity } from "~/core/ports";

import { namesAgree } from "./names";
import { toExchangeCode, venueOf } from "./venues";

export interface MappingJob {
  idType: "ID_ISIN" | "TICKER";
  idValue: string;
}

export interface FigiMatch {
  figi?: string | null;
  shareClassFIGI?: string | null;
  compositeFIGI?: string | null;
  ticker?: string | null;
  name?: string | null;
  exchCode?: string | null;
  securityType2?: string | null;
}

export interface MappingResult {
  data?: FigiMatch[];
  warning?: string;
  error?: string;
}

export function bareTicker(value: string): string {
  const dot = value.lastIndexOf(".");
  return dot === -1 ? value : value.slice(0, dot);
}

export function toMappingJobs(
  identities: readonly RawIdentity[],
): MappingJob[] {
  return identities.map((identity) =>
    identity.kind === "ISIN"
      ? { idType: "ID_ISIN", idValue: identity.value }
      : { idType: "TICKER", idValue: bareTicker(identity.value) },
  );
}

/**
 * Reduce one job's matches to a canonical id.
 *
 * `shareClassFIGI` is the level that answers our question: it links the same
 * share class across every country, which is exactly the ISIN-versus-ticker gap.
 * `compositeFIGI` would only link venues within one country and leave the gap
 * open; the instrument-level `figi` is per listing and would leave every venue
 * separate.
 *
 * Deliberately NOT unified at this level: GOOG and GOOGL, BRK/A and BRK/B,
 * Samsung ordinary and preferred. They are separate securities with separate
 * ISINs and separate prices, they get separate share-class FIGIs, and reporting
 * them apart is more correct than merging them even though it reads oddly.
 */
export function canonicalFrom(
  result: MappingResult | undefined,
  name?: string,
  venue?: string,
): IdentityResolution {
  if (!result) return { status: "not-found" };
  if (result.warning) return { status: "not-found" };
  if (result.error) return { status: "not-found" };

  const matches = (result.data ?? []).filter(
    (match): match is FigiMatch & { shareClassFIGI: string } =>
      typeof match.shareClassFIGI === "string" && match.shareClassFIGI !== "",
  );
  if (matches.length === 0) return { status: "not-found" };

  const classes = new Set(matches.map((match) => match.shareClassFIGI));
  if (classes.size === 1) {
    const [canonicalId] = [...classes];
    return { status: "resolved", canonicalId: canonicalId! };
  }

  const wantedExchange = toExchangeCode(venue ?? null);
  const atVenue = wantedExchange
    ? matches.filter((match) => match.exchCode === wantedExchange)
    : [];
  const venueClasses = new Set(atVenue.map((match) => match.shareClassFIGI));
  if (venueClasses.size === 1) {
    const [canonicalId] = [...venueClasses];
    return { status: "resolved", canonicalId: canonicalId! };
  }

  const pool = venueClasses.size > 1 ? atVenue : matches;
  if (name) {
    const matching = new Set(
      pool
        .filter((match) => match.name && namesAgree(match.name, name))
        .map((match) => match.shareClassFIGI),
    );
    if (matching.size === 1) {
      const [canonicalId] = [...matching];
      return { status: "resolved", canonicalId: canonicalId! };
    }
  }

  return { status: "ambiguous", candidates: classes.size };
}

export function parseMappingResponse(
  identities: readonly RawIdentity[],
  results: readonly MappingResult[],
): Map<string, IdentityResolution> {
  const resolved = new Map<string, IdentityResolution>();
  identities.forEach((identity, index) => {
    resolved.set(
      identity.value,
      canonicalFrom(
        results[index],
        identity.name,
        identity.kind === "TICKER"
          ? (venueOf(identity.value) ?? undefined)
          : undefined,
      ),
    );
  });
  return resolved;
}

export function batch<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
