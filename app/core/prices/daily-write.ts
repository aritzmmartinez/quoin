import Decimal from "decimal.js";

import { dayOf } from "../calendar";
import type { PriceSnapshot } from "../ports";

export interface StoredPrice {
  id: string;
  asOf: Date;
  source: string;
  price: string;
  currency: string;
}

export interface DailyWrite {
  remove: string[];
  write: PriceSnapshot[];
  inserted: number;
  corrected: number;
  live: boolean;
}

export function liveSource(source: string): string {
  return `${source}_LIVE`;
}

export function planDailyWrite(
  stored: readonly StoredPrice[],
  candles: readonly PriceSnapshot[],
  live: PriceSnapshot | null,
): DailyWrite {
  const candleByDay = new Map<string, PriceSnapshot>();
  for (const candle of candles) {
    const day = dayOf(candle.asOf);
    const held = candleByDay.get(day);
    if (!held || held.asOf < candle.asOf) candleByDay.set(day, candle);
  }

  const remove = new Set<string>();
  for (const row of stored) {
    const candle = candleByDay.get(dayOf(row.asOf));
    if (candle && candle.asOf.getTime() !== row.asOf.getTime()) {
      remove.add(row.id);
    }
  }

  const write: PriceSnapshot[] = [];
  let inserted = 0;
  let corrected = 0;
  for (const candle of candleByDay.values()) {
    const same = stored.find(
      (row) =>
        row.asOf.getTime() === candle.asOf.getTime() &&
        row.source === candle.source,
    );
    if (!same) inserted += 1;
    else if (
      !new Decimal(same.price).equals(candle.price) ||
      same.currency !== candle.currency
    ) {
      corrected += 1;
    } else continue;
    write.push(candle);
  }

  let wroteLive = false;
  if (live) {
    const day = dayOf(live.asOf);
    const sameDay = stored.filter(
      (row) => !remove.has(row.id) && dayOf(row.asOf) === day,
    );
    const covered =
      candleByDay.has(day) || sameDay.some((row) => row.source !== live.source);
    if (!covered) {
      for (const row of sameDay) {
        if (row.asOf.getTime() !== live.asOf.getTime()) remove.add(row.id);
      }
      write.push(live);
      wroteLive = true;
    }
  }

  return { remove: [...remove], write, inserted, corrected, live: wroteLive };
}
