import type { MiddlewareFunction } from "react-router";

import { decideRequest, parseAllowedHosts } from "./request-guard";

const allowedNames = parseAllowedHosts(process.env.QUOIN_ALLOWED_HOSTS);

export const requestGuard: MiddlewareFunction<Response> = (
  { request },
  next,
) => {
  const headers = {
    method: request.method,
    host: request.headers.get("Host"),
    secFetchSite: request.headers.get("Sec-Fetch-Site"),
    origin: request.headers.get("Origin"),
  };
  const decision = decideRequest(headers, allowedNames);
  if (decision.ok) return next();

  console.warn("Refused request", {
    ...headers,
    path: new URL(request.url).pathname,
    reason: decision.reason,
  });
  return Response.json({ error: decision.reason }, { status: 403 });
};
