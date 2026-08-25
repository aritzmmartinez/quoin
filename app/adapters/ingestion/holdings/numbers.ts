import Decimal from "decimal.js";

import { KNOWN_CURRENCIES } from "~/adapters/identity/openfigi/currencies";

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

const NOISE = /[\s\u00a0\u2019'%$€£]/g;

function resolveRepeated(text: string, sep: string, lastIndex: number): string {
  const all = new RegExp(`\\${sep}`, "g");
  if (text.indexOf(sep) === lastIndex) {
    return text.replace(sep, ".");
  }
  const lastGroup = text.slice(lastIndex + 1);
  if (lastGroup.length === 3) return text.replace(all, "");
  return text.slice(0, lastIndex).replace(all, "") + "." + lastGroup;
}

export function parseLooseNumber(raw: string): Decimal | null {
  let text = raw.trim().replace(/^"|"$/g, "");
  text = text.replace(/^([-+])\s+/, "$1");
  text = text.replace(NOISE, "");
  if (text === "" || !/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
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

export function looksNumeric(raw: string): boolean {
  return parseLooseNumber(raw) !== null;
}

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export function looksLikeIsin(raw: string): boolean {
  return ISIN.test(raw.trim().toUpperCase());
}

const TICKER = /^[A-Z0-9][A-Z0-9._ -]{0,9}$/;

export function looksLikeTicker(raw: string): boolean {
  const text = raw.trim().toUpperCase();
  return text !== "" && TICKER.test(text);
}

export function looksLikeCashRow(identity: string, name: string): boolean {
  const code = identity.trim().toUpperCase();
  if (!KNOWN_CURRENCIES.has(code)) return false;
  return name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .includes(code);
}
