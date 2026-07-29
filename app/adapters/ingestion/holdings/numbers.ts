import Decimal from "decimal.js";

/**
 * Issuer CSVs write numbers every way a spreadsheet can. Observed in the wild,
 * across six issuers:
 *
 *   4.4503%      dot decimal, percent sign
 *   " 15,51%"    comma decimal, leading space
 *   "- 0,02%"    negative with a space after the sign
 *   "12.52"      dot decimal, no percent sign at all
 *   174’598’847  U+2019 as the thousands separator
 *   $ 322.235.420.00
 *
 * Rather than a rule per issuer, normalise aggressively and let the caller's
 * sum-to-100 check reject a misreading. That check is the real safety net: a
 * column misread by a factor of a thousand cannot sum to 100.
 */

/** Anything that groups digits but carries no meaning. */
const NOISE = /[\s\u00a0\u2019'%$€£]/g;

/**
 * Disambiguate a number that uses one separator character several times.
 *
 * A grouping separator always leaves exactly three digits behind it, so the
 * length of the last group settles it: "322.235.420" is an integer, while
 * "322.235.420.00" is that integer with two decimals — a real format, dots for
 * both jobs in the same number.
 */
function resolveRepeated(text: string, sep: string, lastIndex: number): string {
  const all = new RegExp(`\\${sep}`, "g");
  if (text.indexOf(sep) === lastIndex) {
    // A single separator is a decimal point.
    return text.replace(sep, ".");
  }
  const lastGroup = text.slice(lastIndex + 1);
  if (lastGroup.length === 3) return text.replace(all, "");
  return text.slice(0, lastIndex).replace(all, "") + "." + lastGroup;
}

export function parseLooseNumber(raw: string): Decimal | null {
  let text = raw.trim().replace(/^"|"$/g, "");
  // "- 0,02" -> "-0,02". The sign belongs to the number, not to the whitespace.
  text = text.replace(/^([-+])\s+/, "$1");
  text = text.replace(NOISE, "");
  if (text === "" || !/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the rightmost one is the decimal separator, the other groups.
    text =
      lastComma > lastDot
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if (lastComma !== -1) {
    text = resolveRepeated(text, ",", lastComma);
  } else if (lastDot !== -1) {
    text = resolveRepeated(text, ".", lastDot);
  }

  try {
    const value = new Decimal(text);
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

/** True when the text looks like a label rather than a measurement. */
export function looksNumeric(raw: string): boolean {
  return parseLooseNumber(raw) !== null;
}

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export function looksLikeIsin(raw: string): boolean {
  return ISIN.test(raw.trim().toUpperCase());
}

/**
 * A ticker is short and has no spaces. Numeric tickers are allowed on purpose:
 * Tokyo lists Keyence as 6857, and excluding them threw out a third of a global
 * fund's rows — enough to make the real Ticker column fail detection and hand
 * the job to a two-letter Region column instead.
 */
const TICKER = /^[A-Z0-9][A-Z0-9._ -]{0,9}$/;

export function looksLikeTicker(raw: string): boolean {
  const text = raw.trim().toUpperCase();
  // An internal space is allowed: Nordic share classes are written "HEXA B".
  return text !== "" && TICKER.test(text);
}
