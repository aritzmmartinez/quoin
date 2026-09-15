import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/_shell.tsx", [
    index("routes/summary.tsx"),
    route("portfolio", "routes/portfolio.tsx"),
    route("allocation", "routes/allocation.tsx"),
    route("movements", "routes/movements.tsx"),
    route("realized", "routes/realized.tsx"),
    route("opportunity-cost", "routes/opportunity-cost.tsx"),
    route("ter-cost", "routes/ter.tsx"),
    route("target", "routes/target.tsx"),
    route("projection", "routes/projection.tsx"),
    route("instruments", "routes/instruments.tsx"),
    route("instrument/:instrumentId", "routes/instrument.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
  route("api/prices/sync", "routes/prices-sync.ts"),
  route("api/ipc/sync", "routes/ipc-sync.ts"),
  route("api/ingest", "routes/ingest.ts"),
] satisfies RouteConfig;
