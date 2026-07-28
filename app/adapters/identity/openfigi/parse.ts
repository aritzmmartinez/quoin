import type { IdentityResolution, RawIdentity } from "~/core/ports";

import { namesAgree } from "./names";
import { toExchangeCode, venueOf } from "./venues";

/**
 * Pure request/response handling for the OpenFIGI v3 mapping endpoint.
 *
 * Everything here is a total function over plain data, so the awkward parts —
 * which FIGI level to trust, what an ambiguous ticker means, the v2→v3 key
 * rename — are unit-tested without a network.
 */

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

/**
 * One entry per job, positionally. `data` when found, `warning` when nothing
 * matched, `error` when something actually went wrong.
 */
export interface MappingResult {
  data?: FigiMatch[];
  warning?: string;
  error?: string;
}

/** A venue-qualified ticker is stored as TICKER.VENUE; OpenFIGI wants the bare one. */
export function bareTicker(value: string): string {
  const dot = value.lastIndexOf(".");
  return dot === -1 ? value : value.slice(0, dot);
}

/**
 * Tickers go up without an exchange code on purpose.
 *
 * OpenFIGI's exchCode vocabulary is Bloomberg's, not ISO — Germany is GR, the
 * UK is LN — so feeding it the ISO codes the holdings parser produces would
 * need a lookup table to maintain, which is the thing that rots. Asking by
 * ticker alone returns every listing worldwide, and the unanimity check below
 * turns that into a safe answer: agreement resolves, disagreement refuses.
 */
export function toMappingJobs(identities: readonly RawIdentity[]): MappingJob[] {
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
  // v3 renamed the "no match" key from `error` to `warning`; checking only the
  // old one silently swallows every miss, so both are handled.
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

  // Several share classes under one ticker means several companies: SAN is
  // Santander in Madrid and Sanofi in Paris. Bloomberg has handed over the full
  // candidate set, so the two things this file already knows — where the holding
  // trades, and what the issuer calls it — can say which one it meant. Both are
  // narrower questions than pairing leaves by how alike their names look.

  // Where it trades, first: it is structured data rather than prose, so it is
  // the stronger signal. A venue we have no code for filters nothing.
  const wantedExchange = toExchangeCode(venue ?? null);
  const atVenue = wantedExchange
    ? matches.filter((match) => match.exchCode === wantedExchange)
    : [];
  const venueClasses = new Set(atVenue.map((match) => match.shareClassFIGI));
  if (venueClasses.size === 1) {
    const [canonicalId] = [...venueClasses];
    return { status: "resolved", canonicalId: canonicalId! };
  }

  // Then the name, over whatever the venue left — or over everything if it left
  // nothing to work with.
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

  // No name, no match, or several matches: refuse. A wrong merge silently
  // claims a holding that does not exist, which is worse than not merging.
  return { status: "ambiguous", candidates: classes.size };
}

/** Zip a batch's results back onto the identities that produced them. */
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
        identity.kind === "TICKER" ? (venueOf(identity.value) ?? undefined) : undefined,
      ),
    );
  });
  return resolved;
}

/**
 * Split into request-sized batches.
 *
 * Ten jobs per request unauthenticated, a hundred with a key — and the
 * difference is not cosmetic: five thousand leaves is five hundred requests at
 * twenty-five a minute, so twenty minutes without a key against a few seconds
 * with one. Callers order by weight so the visible rows land in the first
 * batches either way.
 */
export function batch<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
