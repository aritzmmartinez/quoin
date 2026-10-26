import { liveSource } from "./daily-write";

export const DAILY_CANDLE_MS = 24 * 60 * 60 * 1000;

/**
 * When a stored price became information. Yahoo dates a daily candle at the
 * start of its session and fills it with that session's close: measured on
 * 2026-10-22, a BTC-EUR candle dated 00:00 UTC carries the close of 24:00 UTC
 * (within 0.1% of the last hourly close, up to 2.2% away from the first). Read
 * at its date, it is a price from up to a day later, so a lookup "at or before"
 * a moment counts a candle only once its day has closed. A live quote is dated
 * by its own market time and counts from then.
 *
 * A session shorter than a day (an ETF) is known before the day ends; counting
 * it a day late can only fall back to the previous close, never reach forward.
 */
export function candleKnownAt(asOf: Date): number {
  return asOf.getTime() + DAILY_CANDLE_MS;
}

export function snapshotKnownAt(snapshot: {
  asOf: Date;
  source: string;
}): number {
  return snapshot.source.endsWith(liveSource(""))
    ? snapshot.asOf.getTime()
    : candleKnownAt(snapshot.asOf);
}
