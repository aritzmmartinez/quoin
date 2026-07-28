import type { IdentityResolution, RawIdentity } from "./security-identity-resolver";

export interface CachedIdentity extends RawIdentity {
  resolution: IdentityResolution;
  source: string;
  resolvedAt: Date;
}

export interface SecurityIdentityRepository {
  /** Every cached mapping, keyed by raw identity. Read at render time. */
  all(): Promise<Map<string, CachedIdentity>>;
  /** Upsert a batch, misses included. */
  save(entries: readonly Omit<CachedIdentity, "resolvedAt">[]): Promise<number>;
  /** Raw identities with no cache entry yet, in the order given. */
  unresolved(identities: readonly RawIdentity[]): Promise<RawIdentity[]>;
  /**
   * Raw identities the provider previously refused, in the order given. Kept
   * separate from `unresolved` because a refusal is a real answer worth caching
   * — but one worth revisiting when the resolver gets better at asking.
   */
  ambiguous(identities: readonly RawIdentity[]): Promise<RawIdentity[]>;
}
