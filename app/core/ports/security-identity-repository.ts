import type {
  IdentityResolution,
  RawIdentity,
} from "./security-identity-resolver";

export interface CachedIdentity extends RawIdentity {
  resolution: IdentityResolution;
  source: string;
  resolvedAt: Date;
}

export interface SecurityIdentityRepository {
  all(): Promise<Map<string, CachedIdentity>>;
  save(entries: readonly Omit<CachedIdentity, "resolvedAt">[]): Promise<number>;
  unresolved(identities: readonly RawIdentity[]): Promise<RawIdentity[]>;
  ambiguous(identities: readonly RawIdentity[]): Promise<RawIdentity[]>;
}
