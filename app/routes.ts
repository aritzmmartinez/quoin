import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/_shell.tsx", [
    index("routes/portfolio.tsx"),
    route("instrument/:instrumentId", "routes/instrument.tsx"),
  ]),
] satisfies RouteConfig;
