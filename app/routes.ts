import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/portfolio.tsx"),
  route("instrument/:instrumentId", "routes/instrument.tsx"),
] satisfies RouteConfig;
