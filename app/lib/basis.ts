export type Basis = "nominal" | "real";

export const BASIS_COOKIE = "quoin-basis";
export const BASIS_KEYS = ["nominal", "real"] as const;
export const DEFAULT_BASIS: Basis = "nominal";

export function parseBasis(cookieHeader: string | null): Basis {
  return cookieHeader?.includes(`${BASIS_COOKIE}=real`) ? "real" : "nominal";
}
