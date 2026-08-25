/**
 * A security identifier exactly as an issuer published it.
 *
 * Issuers disagree on what to publish: Amundi, HANetf and VanEck give an ISIN,
 * Vanguard and iShares give a venue-qualified ticker. They hold hundreds of the
 * same companies, so the same business arrives as `US00TEST0005` from one file
 * and `ACME.US` from another and stays two leaves.
 */
export interface RawIdentity {
  value: string;
  kind: "ISIN" | "TICKER";
  name?: string;
}

/**
 * The outcome of trying to give a raw identity a canonical one.
 *
 * "Not found" and "ambiguous" are ordinary outcomes, not errors: a leaf that
 * cannot be resolved keeps its raw identity, so it still appears with the right
 * value — it just does not merge with its twin. Degrading is always better than
 * guessing, because a wrong merge silently claims a holding that does not exist.
 */
export type IdentityResolution =
  | {
      status: "resolved";
      canonicalId: string;
      exchCode: string | null;
    }
  | { status: "not-found" }
  | { status: "ambiguous"; candidates: number };

export interface SecurityIdentityResolver {
  readonly source: string;
  /**
   * Resolve a batch, in the order given. Implementations should treat that order
   * as a priority: callers pass the heaviest leaves first so that the rows a
   * person can actually see converge before the long tail, which matters when an
   * unauthenticated caller is limited to a few hundred lookups a minute.
   */
  resolve(
    identities: readonly RawIdentity[],
  ): Promise<Map<string, IdentityResolution>>;
}
