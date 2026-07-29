import type {
  IdentityResolution,
  RawIdentity,
  SecurityIdentityResolver,
} from "~/core/ports";

import {
  batch,
  parseMappingResponse,
  toMappingJobs,
  type MappingResult,
} from "./parse";

const ENDPOINT = "https://api.openfigi.com/v3/mapping";

/**
 * Published limits, and the reason this class throttles at all:
 *
 *                        no key        with key
 *   jobs per request     10            100
 *   requests             25 / minute   25 / 6 seconds
 *
 * Five thousand leaves is twenty minutes unauthenticated and about ten seconds
 * with a free key. Callers order by weight so the rows a person can see land in
 * the first requests either way.
 */
const LIMITS = {
  anonymous: { jobsPerRequest: 10, minIntervalMs: 2_400 },
  authenticated: { jobsPerRequest: 100, minIntervalMs: 240 },
} as const;

export interface OpenFigiOptions {
  apiKey?: string | undefined;
  maxIdentities?: number;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  onProgress?: (done: number, total: number) => void;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class OpenFigiIdentityResolver implements SecurityIdentityResolver {
  readonly source = "openfigi";

  private readonly apiKey: string | undefined;
  private readonly maxIdentities: number;
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number | undefined;
  private readonly onProgress:
    | ((done: number, total: number) => void)
    | undefined;

  constructor(options: OpenFigiOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENFIGI_API_KEY;
    this.maxIdentities = options.maxIdentities ?? Number.POSITIVE_INFINITY;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minIntervalMs = options.minIntervalMs;
    this.onProgress = options.onProgress;
  }

  async resolve(
    identities: readonly RawIdentity[],
  ): Promise<Map<string, IdentityResolution>> {
    const limits = this.apiKey ? LIMITS.authenticated : LIMITS.anonymous;
    const wanted = identities.slice(0, this.maxIdentities);
    const resolved = new Map<string, IdentityResolution>();

    const batches = batch(wanted, limits.jobsPerRequest);
    let done = 0;

    for (const [index, group] of batches.entries()) {
      const gap = this.minIntervalMs ?? limits.minIntervalMs;
      if (index > 0 && gap > 0) await sleep(gap);

      try {
        const results = await this.request(group);
        for (const [value, resolution] of parseMappingResponse(
          group,
          results,
        )) {
          resolved.set(value, resolution);
        }
      } catch {
        for (const identity of group) {
          resolved.set(identity.value, { status: "not-found" });
        }
      }

      done += group.length;
      this.onProgress?.(done, wanted.length);
    }

    return resolved;
  }

  private async request(
    identities: readonly RawIdentity[],
  ): Promise<MappingResult[]> {
    const response = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "X-OPENFIGI-APIKEY": this.apiKey } : {}),
      },
      body: JSON.stringify(toMappingJobs(identities)),
    });

    if (!response.ok) {
      throw new Error(`OpenFIGI responded ${response.status}`);
    }

    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      throw new Error("OpenFIGI returned an unexpected payload");
    }
    return body as MappingResult[];
  }
}
