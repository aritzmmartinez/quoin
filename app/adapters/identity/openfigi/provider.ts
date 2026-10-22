import {
  type IdentityResolution,
  type IdentityResolutionBatch,
  IdentityResolutionUnavailableError,
  type RawIdentity,
  type SecurityIdentityResolver,
} from "~/core/ports";

import { withTimeout } from "~/adapters/http";

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
  anonymous: { jobsPerRequest: 10, minIntervalMs: 2_400, timeoutMs: 30_000 },
  authenticated: {
    jobsPerRequest: 100,
    minIntervalMs: 240,
    timeoutMs: 120_000,
  },
} as const;

export const OPENFIGI_TIMEOUT_MS = {
  anonymous: LIMITS.anonymous.timeoutMs,
  authenticated: LIMITS.authenticated.timeoutMs,
} as const;

export interface OpenFigiOptions {
  apiKey?: string | undefined;
  maxIdentities?: number;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  timeoutMs?: number;
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
  private readonly timeoutMs: number | undefined;
  private readonly onProgress:
    | ((done: number, total: number) => void)
    | undefined;

  constructor(options: OpenFigiOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENFIGI_API_KEY;
    this.maxIdentities = options.maxIdentities ?? Number.POSITIVE_INFINITY;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minIntervalMs = options.minIntervalMs;
    this.timeoutMs = options.timeoutMs;
    this.onProgress = options.onProgress;
  }

  async resolve(
    identities: readonly RawIdentity[],
  ): Promise<IdentityResolutionBatch> {
    const limits = this.apiKey ? LIMITS.authenticated : LIMITS.anonymous;
    const timeoutMs = this.timeoutMs ?? limits.timeoutMs;
    const wanted = identities.slice(0, this.maxIdentities);
    const resolutions = new Map<string, IdentityResolution>();

    const batches = batch(wanted, limits.jobsPerRequest);
    let done = 0;

    for (const [index, group] of batches.entries()) {
      const gap = this.minIntervalMs ?? limits.minIntervalMs;
      if (index > 0 && gap > 0) await sleep(gap);

      let results: MappingResult[];
      try {
        results = await this.request(group, timeoutMs);
      } catch (cause) {
        const unavailable =
          cause instanceof IdentityResolutionUnavailableError
            ? cause
            : new IdentityResolutionUnavailableError(null, { cause });
        return { resolutions, unavailable };
      }

      for (const [value, resolution] of parseMappingResponse(group, results)) {
        resolutions.set(value, resolution);
      }

      done += group.length;
      this.onProgress?.(done, wanted.length);
    }

    return { resolutions, unavailable: null };
  }

  private request(
    identities: readonly RawIdentity[],
    timeoutMs: number,
  ): Promise<MappingResult[]> {
    return withTimeout(timeoutMs, async (signal) => {
      const response = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "X-OPENFIGI-APIKEY": this.apiKey } : {}),
        },
        body: JSON.stringify(toMappingJobs(identities)),
        signal,
      });

      if (!response.ok) {
        throw new IdentityResolutionUnavailableError(response.status);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        throw new IdentityResolutionUnavailableError(response.status, {
          cause,
        });
      }
      if (!Array.isArray(body)) {
        throw new IdentityResolutionUnavailableError(response.status, {
          cause: new Error("OpenFIGI returned an unexpected payload"),
        });
      }
      return body as MappingResult[];
    });
  }
}
