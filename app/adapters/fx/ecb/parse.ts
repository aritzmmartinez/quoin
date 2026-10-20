import Decimal from "decimal.js";
import Papa from "papaparse";

import { parseIsoDate } from "~/core/calendar";
import type { FxRate } from "~/core/ports";

export const ECB_SOURCE = "ECB";
export const ECB_BASE = "EUR";

const COLUMNS = [
  "FREQ",
  "CURRENCY",
  "CURRENCY_DENOM",
  "TIME_PERIOD",
  "OBS_VALUE",
] as const;

export function parseEcbCsv(body: string, quote: string): FxRate[] {
  if (body.trim() === "") return [];

  const { data, errors, meta } = Papa.parse<Record<string, string>>(body, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (errors.length > 0) {
    throw new Error(`ECB CSV parse error: ${errors[0]!.message}`);
  }
  const missing = COLUMNS.filter((column) => !meta.fields?.includes(column));
  if (missing.length > 0) {
    throw new Error(`ECB CSV is missing ${missing.join(", ")}`);
  }

  const rates = data.map((row, index): FxRate => {
    const at = `ECB CSV row ${index + 2}`;
    if (row.FREQ !== "D") throw new Error(`${at}: frequency ${row.FREQ}`);
    if (row.CURRENCY !== quote) {
      throw new Error(`${at}: currency ${row.CURRENCY}, asked for ${quote}`);
    }
    if (row.CURRENCY_DENOM !== ECB_BASE) {
      throw new Error(`${at}: denominator ${row.CURRENCY_DENOM}`);
    }
    const day = row.TIME_PERIOD ?? "";
    parseIsoDate(day);
    const rate = row.OBS_VALUE ?? "";
    if (!isPositiveDecimal(rate)) {
      throw new Error(`${at}: rate ${JSON.stringify(rate)}`);
    }
    return { source: ECB_SOURCE, base: ECB_BASE, quote, day, rate };
  });

  return rates.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

function isPositiveDecimal(value: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  return new Decimal(value).gt(0);
}
