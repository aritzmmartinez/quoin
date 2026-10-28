/**
 * A hybrid logical clock mark: `<ms, 15 digits>-<counter, 4 digits>-<deviceId>`.
 * Plain ASCII and fixed-width up front, so string order is time order on every
 * side that ports this (no BigInt, no locale). A mark is only ever compared with
 * marks of the device that wrote it; the device id is there to say which one.
 */
export interface Hlc {
  ms: number;
  counter: number;
  deviceId: string;
}

const MS_DIGITS = 15;
const COUNTER_DIGITS = 4;
const MAX_COUNTER = 10 ** COUNTER_DIGITS - 1;
const PATTERN = /^(\d{15})-(\d{4})-(.+)$/;

export class InvalidHlcError extends Error {
  constructor(value: string) {
    super(`Not a sync mark: "${value}"`);
    this.name = "InvalidHlcError";
  }
}

export function formatHlc({ ms, counter, deviceId }: Hlc): string {
  return `${String(ms).padStart(MS_DIGITS, "0")}-${String(counter).padStart(COUNTER_DIGITS, "0")}-${deviceId}`;
}

export function parseHlc(value: string): Hlc {
  const match = PATTERN.exec(value);
  if (!match) throw new InvalidHlcError(value);
  return {
    ms: Number(match[1]),
    counter: Number(match[2]),
    deviceId: match[3]!,
  };
}

export function originOf(value: string): string {
  return parseHlc(value).deviceId;
}

/**
 * The next mark after `last`, never earlier than it whatever the physical clock
 * says, so a clock set back after a sync cannot hide a change made since.
 */
export function tick(last: string | null, nowMs: number, deviceId: string): string {
  const previous = last ? parseHlc(last) : null;
  if (!previous || nowMs > previous.ms) {
    return formatHlc({ ms: nowMs, counter: 0, deviceId });
  }
  if (previous.counter < MAX_COUNTER) {
    return formatHlc({ ms: previous.ms, counter: previous.counter + 1, deviceId });
  }
  return formatHlc({ ms: previous.ms + 1, counter: 0, deviceId });
}
