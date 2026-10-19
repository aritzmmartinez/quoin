/**
 * Normalise however an issuer spells a venue into an ISO country code.
 *
 * Vanguard writes "US", iShares writes "United States", and a Spanish issuer
 * could write "Estados Unidos" — the same listing, three strings. Left alone
 * they became three leaves, so the parser was manufacturing collisions of its
 * own on top of the real ones.
 *
 * `Intl.DisplayNames` does this without a table to maintain: it already knows
 * every country in every locale the runtime ships, so the reverse index comes
 * from the standard library rather than from a list that rots.
 */

const LOCALES = ["en", "es", "de", "fr", "it", "nl", "pt"] as const;

const ISO2 = /^[A-Z]{2}$/;

interface Regions {
  byName: Map<string, string>;
  named: Set<string>;
}

let regions: Regions | null = null;

function buildRegions(): Regions {
  const byName = new Map<string, string>();
  const named = new Set<string>();

  for (const locale of LOCALES) {
    let names: Intl.DisplayNames;
    try {
      names = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      continue;
    }

    for (let first = 65; first <= 90; first++) {
      for (let second = 65; second <= 90; second++) {
        const code = String.fromCharCode(first, second);
        let name: string | undefined;
        try {
          name = names.of(code);
        } catch {
          continue;
        }
        // An unassigned code returns itself rather than throwing.
        if (!name || name === code) continue;
        named.add(code);
        byName.set(fold(name), canonicalRegion(code));
      }
    }
  }

  return { byName, named };
}

export function canonicalRegion(code: string): string {
  try {
    const [tag] = Intl.getCanonicalLocales(`und-${code}`);
    return (tag && new Intl.Locale(tag).region) ?? code;
  } catch {
    return code;
  }
}

function canonicalCode(code: string): string {
  regions ??= buildRegions();
  return regions.named.has(code) ? canonicalRegion(code) : code;
}

export function isObsoleteRegion(code: string): boolean {
  return ISO2.test(code) && canonicalCode(code) !== code;
}

/** Case, accents and punctuation vary; the country does not. */
function fold(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,'’`()]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * The ISO code for a venue, or null when the string is not a country — an
 * exchange name like "NASDAQ" is left for the caller to keep verbatim, since
 * guessing at it would merge venues that are genuinely different.
 */
export function toCountryCode(raw: string): string | null {
  const text = raw.trim();
  if (text === "") return null;
  if (ISO2.test(text)) return canonicalCode(text);

  regions ??= buildRegions();
  return regions.byName.get(fold(text)) ?? null;
}

/** Normalised when we can, verbatim when we cannot. Never empty. */
export function normaliseVenue(raw: string): string {
  return toCountryCode(raw) ?? raw.trim();
}

/** Share of a column's values that name a country, used to rank qualifiers. */
export function countryShare(values: readonly string[]): number {
  const filled = values.filter((v) => v.trim() !== "");
  if (filled.length === 0) return 0;
  return filled.filter((v) => toCountryCode(v) !== null).length / filled.length;
}
