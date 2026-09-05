import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/_shell.tsx", [
    index("routes/summary.tsx"),
    route("cartera", "routes/portfolio.tsx"),
    route("asignacion", "routes/allocation.tsx"),
    route("movimientos", "routes/movements.tsx"),
    route("realizado", "routes/realized.tsx"),
    route("coste-oportunidad", "routes/opportunity-cost.tsx"),
    route("coste-ter", "routes/ter.tsx"),
    route("objetivo", "routes/target.tsx"),
    route("proyeccion", "routes/projection.tsx"),
    route("instrumentos", "routes/instruments.tsx"),
    route("instrument/:instrumentId", "routes/instrument.tsx"),
  ]),
  route("api/prices/sync", "routes/prices-sync.ts"),
] satisfies RouteConfig;
