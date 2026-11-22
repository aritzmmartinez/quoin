export type RequestHeaders = {
  method: string;
  host: string | null;
  secFetchSite: string | null;
  origin: string | null;
};

export type RefusalReason = "forbidden-host" | "cross-site";

export type RequestDecision =
  | { ok: true }
  | { ok: false; reason: RefusalReason };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function hostnameOf(host: string): string | null {
  let url: URL;
  try {
    url = new URL(`http://${host}`);
  } catch {
    return null;
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return url.hostname;
}

const isIpLiteral = (hostname: string): boolean =>
  hostname.startsWith("[") || IPV4.test(hostname);

export function parseAllowedHosts(raw: string | undefined): Set<string> {
  const names = new Set<string>();
  for (const entry of (raw ?? "").split(",")) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    const hostname = hostnameOf(trimmed);
    if (hostname !== null) names.add(hostname);
  }
  return names;
}

export function isAllowedHost(
  host: string | null,
  allowedNames: ReadonlySet<string>,
): boolean {
  if (host === null) return false;
  const hostname = hostnameOf(host);
  if (hostname === null) return false;
  return (
    hostname === "localhost" ||
    isIpLiteral(hostname) ||
    allowedNames.has(hostname)
  );
}

function originMatchesHost(origin: string, host: string): boolean {
  try {
    const from = new URL(origin);
    return from.host === new URL(`${from.protocol}//${host}`).host;
  } catch {
    return false;
  }
}

export function decideRequest(
  request: RequestHeaders,
  allowedNames: ReadonlySet<string>,
): RequestDecision {
  if (!isAllowedHost(request.host, allowedNames)) {
    return { ok: false, reason: "forbidden-host" };
  }
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { ok: true };

  const site = request.secFetchSite;
  if (site === "cross-site" || site === "same-site") {
    return { ok: false, reason: "cross-site" };
  }
  if (site !== null) return { ok: true };

  if (
    request.origin !== null &&
    !originMatchesHost(request.origin, request.host ?? "")
  ) {
    return { ok: false, reason: "cross-site" };
  }
  return { ok: true };
}
