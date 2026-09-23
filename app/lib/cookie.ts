const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * One cookie from a `Cookie` header, decoded. `null` when absent or when the
 * value is not valid percent-encoding: a preference cookie is user-editable
 * input, and a malformed one must fall back to the default, not throw in a
 * loader.
 */
export function readCookie(
  cookieHeader: string | null,
  name: string,
): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at === -1 || part.slice(0, at).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function writePreferenceCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${ONE_YEAR};samesite=lax`;
}
