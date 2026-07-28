/**
 * Fold a company name to something two sources can agree on.
 *
 * Issuers write the same company as "NVIDIA Corp", "NVIDIA CORPORATION" and
 * "Nvidia Corp"; legal forms, punctuation and accents carry no information for
 * this purpose. Used only to choose between candidates the provider returned
 * under one ticker — never to pair leaves across files.
 */

/** Legal forms and share-class markers, which vary by source and mean nothing here. */
const NOISE =
  /\b(corp|corporation|inc|incorporated|co|company|ltd|limited|plc|sa|ag|nv|se|spa|oyj|ab|as|asa|holding|holdings|group|the|class|cl|reg|shs|adr|gdr)\b/g;

export function normaliseCompanyName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Dots and apostrophes are removed rather than spaced out: turning "S.A."
    // into "s a" hides the legal form from the stripper below, so "Banco
    // Santander, S.A." and "BANCO SANTANDER SA" would not agree.
    .replace(/[.'’`]/g, "")
    .replace(/[,\-()&/]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Do two names refer to the same company?
 *
 * Exact agreement first, then containment — because sources truncate at
 * different widths. One issuer publishes "TAIWAN SEMICONDUCTOR MANUFAC", another
 * "Taiwan Semiconductor Manufacturing Co Ltd", and the provider its own clipped
 * version; demanding an exact match leaves the biggest chip maker in the world
 * split across two leaves.
 *
 * Containment is looser than equality, so it is only safe because the caller
 * requires the match to be UNIQUE among the candidates. A prefix that fits two
 * candidates resolves nothing, which is the correct outcome.
 */
export function namesAgree(a: string, b: string): boolean {
  const left = normaliseCompanyName(a);
  const right = normaliseCompanyName(b);
  if (left === "" || right === "") return false;
  if (left === right) return true;

  // Guard against a short name swallowing an unrelated longer one: "bank" must
  // not match "bank of america".
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (shorter.length < 8) return false;

  return longer.startsWith(shorter);
}
