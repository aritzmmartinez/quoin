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

export function isinCountry(value: string): string | null {
  const isin = value.trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin) ? isin.slice(0, 2) : null;
}

/**
 * The composite exchange code a share class does business in.
 *
 * OpenFIGI answers a mapping job with every listing it knows, and the rows that
 * satisfy `figi === compositeFIGI` are the country-level composites, one per
 * country, each covering that country's venues (`US` above `UN`, `UW`, `UQ`).
 *
 * WHAT IS NOT IN THE PAYLOAD: which of those countries is the primary listing.
 * This was measured, not assumed. NVIDIA's ISIN returns 247 rows and SIXTEEN
 * self-composite ones — US, GR, MM, SW, CI, CB and a row of multi-currency MTF
 * lines (`NVDAEUR`, `NVDAGBP`, `NVDAJPY`…) — all of them `Common Stock`, all
 * the same `shareClassFIGI`, all the same `name`. Accenture returns nine.
 * Nothing distinguishes them: not `securityType`, not `securityType2`, not the
 * ticker (NVIDIA's shortest is `NVD`, in Frankfurt). Any large cap looks like
 * this, which is why refusing on "more than one country" refused 99% of an
 * actual portfolio.
 *
 * So the country is supplied from OUTSIDE, and this function's job is to
 * CONFIRM it against a real listing rather than to discover it:
 *
 *   exactly one composite  → that one; there is nothing to disambiguate
 *   `country` listed       → the country's own code, if any row carries it
 *   no composite at all    → unanimity across the venue rows, else null
 *
 * The confirmation step is what keeps the registered country from ever deciding
 * alone, which was the whole objection to reading the ISIN prefix. Accenture is
 * registered in Ireland (`IE00B4BNMY34`) and not one of its 120 rows carries an
 * Irish code, so the prefix proposes IE, nothing confirms it, and the answer is
 * null — unresolved, never EUR. NVIDIA proposes US, US rows exist, it resolves.
 *
 * Confirmation looks at EVERY row of the share class, not only the ones that
 * mark themselves composite, because the composite row of the country that
 * matters is sometimes simply absent. ASML is the case that showed it: twelve
 * self-composite rows, none of them Amsterdam, while the Amsterdam listing is
 * right there as a venue row under a composite FIGI the payload never returns.
 * Requiring a self-composite row would report a Dutch blue chip as unresolved.
 *
 * `country` missing, or unlisted in the bridge table, filters nothing in — so a
 * gap there costs coverage and can never invent a currency.
 */
export function primaryExchCode(
  matches: readonly FigiMatch[],
  shareClassFIGI: string,
  country?: string | null,
): string | null {
  const own = matches.filter(
    (match) => match.shareClassFIGI === shareClassFIGI,
  );
  const codeOf = (match: FigiMatch): string | null =>
    typeof match.exchCode === "string" && match.exchCode !== ""
      ? match.exchCode
      : null;

  const composites = [
    ...new Set(
      own
        .filter((match) => match.figi && match.figi === match.compositeFIGI)
        .map(codeOf)
        .filter((code): code is string => code !== null),
    ),
  ];
  if (composites.length === 1) return composites[0]!;

  const wanted = toExchangeCode(country ?? null);
  if (wanted && own.some((match) => codeOf(match) === wanted)) return wanted;
  if (composites.length > 1) return null;

  const codes = new Set(
    own.map(codeOf).filter((code): code is string => code !== null),
  );
  return codes.size === 1 ? [...codes][0]! : null;
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
  country?: string,
): IdentityResolution {
  if (!result) return { status: "not-found" };
  if (result.warning) return { status: "not-found" };
  if (result.error) return { status: "not-found" };

  const matches = (result.data ?? []).filter(
    (match): match is FigiMatch & { shareClassFIGI: string } =>
      typeof match.shareClassFIGI === "string" && match.shareClassFIGI !== "",
  );
  if (matches.length === 0) return { status: "not-found" };

  const resolved = (canonicalId: string): IdentityResolution => ({
    status: "resolved",
    canonicalId,
    exchCode: primaryExchCode(matches, canonicalId, country ?? venue),
  });

  const classes = new Set(matches.map((match) => match.shareClassFIGI));
  if (classes.size === 1) {
    const [canonicalId] = [...classes];
    return resolved(canonicalId!);
  }

  const wantedExchange = toExchangeCode(venue ?? null);
  const atVenue = wantedExchange
    ? matches.filter((match) => match.exchCode === wantedExchange)
    : [];
  const venueClasses = new Set(atVenue.map((match) => match.shareClassFIGI));
  if (venueClasses.size === 1) {
    const [canonicalId] = [...venueClasses];
    return resolved(canonicalId!);
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
      return resolved(canonicalId!);
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
        identity.kind === "ISIN"
          ? (isinCountry(identity.value) ?? undefined)
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
