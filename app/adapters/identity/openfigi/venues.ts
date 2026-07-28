/**
 * ISO country code to Bloomberg composite exchange code.
 *
 * OpenFIGI speaks Bloomberg's exchange vocabulary, which is not ISO: Taiwan is
 * TT, Japan JT, Korea KS, Germany GR, the UK LN. The holdings parser produces
 * ISO codes, so bridging them needs this table — the thing that was avoided for
 * as long as possible, and is worth it here for one reason:
 *
 * A WRONG OR MISSING ENTRY COSTS NOTHING. The map is only ever used to narrow a
 * candidate set that is already ambiguous. If the code is absent, or maps to
 * something no candidate uses, the filter matches nothing and the caller falls
 * through to name matching exactly as before. It can turn "ambiguous" into
 * "resolved"; it can never turn "resolved" into something wrong.
 *
 * Only the venues that appear in real fund holdings are listed. Bloomberg's
 * codes are stable — they are the same ones on a terminal — so this does not
 * rot the way an endpoint or a URL would.
 */
const BLOOMBERG_EXCHANGE: Record<string, string> = {
  US: "US",
  CA: "CT",
  GB: "LN",
  DE: "GR",
  FR: "FP",
  ES: "SM",
  IT: "IM",
  NL: "NA",
  BE: "BB",
  PT: "PL",
  AT: "AV",
  IE: "ID",
  CH: "SW",
  SE: "SS",
  NO: "NO",
  DK: "DC",
  FI: "FH",
  JP: "JT",
  HK: "HK",
  TW: "TT",
  KR: "KS",
  SG: "SP",
  AU: "AU",
  NZ: "NZ",
  IN: "IN",
  CN: "CH",
  TH: "TB",
  MY: "MK",
  ID: "IJ",
  PH: "PM",
  BR: "BZ",
  MX: "MM",
  ZA: "SJ",
  TR: "TI",
  PL: "PW",
  IL: "IT",
  GR: "GA",
  HU: "HB",
  CZ: "CP",
  AE: "DU",
  SA: "AB",
  QA: "QD",
  CL: "CI",
  CO: "CX",
  PE: "PE",
};

export function venueOf(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot === -1) return null;
  const venue = value.slice(dot + 1);
  return venue === "" ? null : venue;
}

export function toExchangeCode(isoCountry: string | null): string | null {
  if (!isoCountry) return null;
  return BLOOMBERG_EXCHANGE[isoCountry.toUpperCase()] ?? null;
}
