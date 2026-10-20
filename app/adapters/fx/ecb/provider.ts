import { parseIsoDate } from "~/core/calendar";
import { currencyCodeSchema } from "~/core/domain";
import {
  FxRatesUnavailableError,
  type FxRate,
  type FxRateProvider,
} from "~/core/ports";

import { ECB_BASE, ECB_SOURCE, parseEcbCsv } from "./parse";

const BASE = "https://data-api.ecb.europa.eu/service/data/EXR";
export const ECB_TIMEOUT_MS = 30_000;

const ECB_CODE = /^[A-Z]{3}$/;

export function ecbRatesUrl(quote: string, from: string, to: string): string {
  const params = new URLSearchParams({
    startPeriod: from,
    endPeriod: to,
    format: "csvdata",
    detail: "dataonly",
  });
  return `${BASE}/D.${quote}.${ECB_BASE}.SP00.A?${params.toString()}`;
}

export class EcbFxRateProvider implements FxRateProvider {
  readonly source = ECB_SOURCE;
  readonly base = ECB_BASE;

  async getRates(quote: string, from: string, to: string): Promise<FxRate[]> {
    currencyCodeSchema.parse(quote);
    parseIsoDate(from);
    parseIsoDate(to);
    if (!ECB_CODE.test(quote)) return [];

    let res: Response;
    try {
      res = await fetch(ecbRatesUrl(quote, from, to), {
        signal: AbortSignal.timeout(ECB_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new FxRatesUnavailableError(quote, null, { cause });
    }

    let body: string;
    try {
      body = await res.text();
    } catch (cause) {
      throw new FxRatesUnavailableError(quote, res.status, { cause });
    }

    if (res.status === 404 && isNotFound(body)) return [];
    if (!res.ok) throw new FxRatesUnavailableError(quote, res.status);
    try {
      return parseEcbCsv(body, quote);
    } catch (cause) {
      throw new FxRatesUnavailableError(quote, res.status, { cause });
    }
  }
}

function isNotFound(body: string): boolean {
  try {
    return (JSON.parse(body) as { title?: unknown }).title === "Not Found";
  } catch {
    return false;
  }
}
