import type { InstrumentType, Sleeve } from "~/core/domain";

/**
 * Single source of truth for user-facing copy (Spanish only, for now).
 *
 * Deliberately centralized rather than scattered through JSX: adding a second
 * locale later becomes wrapping this object, not hunting literals across the tree.
 * Typed `as const` so keys are checked at compile time.
 */
export const es = {
  nav: {
    brand: "Quoin",
    overview: "Resumen",
    portfolio: "Cartera",
    allocation: "Asignación",
    movements: "Movimientos",
    soon: "Pronto",
  },
  theme: {
    toggle: "Cambiar tema",
  },
  range: {
    label: "Rango temporal",
    m1: "1M",
    m6: "6M",
    y1: "1A",
    all: "Todo",
  },
  portfolio: {
    title: "Cartera",
    summary: (count: number, invested: string): string =>
      `${count} ${count === 1 ? "posición" : "posiciones"} · ${invested} aportado`,
    columns: {
      name: "Instrumento",
      type: "Tipo",
      quantity: "Cantidad",
      averageCost: "Precio medio",
      costBasis: "Aportado",
      marketValue: "Valor",
      unrealizedPnL: "P&L",
      weight: "Peso",
    },
    detail: {
      isin: "ISIN",
      currency: "Divisa",
      assetClass: "Clase de activo",
      realizedPnL: "P&L realizado",
      firstTrade: "Primera compra",
      lastTrade: "Última operación",
      tradeCount: "Nº de operaciones",
    },
    updatedAt: (relative: string): string => `Actualizado ${relative}`,
    noPrices: "Sin precios — ejecuta pnpm prices:sync",
    empty: {
      title: "Sin posiciones todavía",
      body: "Importa tus movimientos con la CLI (pnpm ingest) para empezar a seguir tu cartera.",
    },
    error: {
      title: "No se pudieron cargar las posiciones",
      body: "Comprueba la fuente de datos y vuelve a intentarlo.",
      retry: "Reintentar",
    },
    expandLabel: "Ver detalle",
  },
  instrument: {
    back: "Cartera",
    viewFallback: "Activo",
    units: (n: string): string => `${n} uds`,
    value: "Valor",
    unrealizedPnL: "P&L no realizado",
    kpis: {
      twr: { label: "TWR", sub: "ponderada por tiempo" },
      mwr: { label: "MWR / TIR", sub: "ponderada por dinero" },
      totalInvested: { label: "Total aportado", sub: "suma de compras" },
      buyCount: { label: "Aportaciones", sub: "compras realizadas" },
      avgBuyAmount: { label: "Importe medio", sub: "por aportación" },
    },
    priceChart: {
      title: "Precio y operaciones",
      price: "Precio",
      avgCost: "Coste medio",
      buy: "Compra",
      sell: "Venta",
      empty: "Sin operaciones registradas.",
      noPrice:
        "Sin histórico de precio todavía — se construye con cada pnpm prices:sync.",
    },
    ivvChart: {
      title: "Invertido vs. valor",
      invested: "Aportado",
      value: "Valor",
      building:
        "El valor se irá dibujando conforme el histórico de precio se acumule.",
    },
    movements: {
      title: "Movimientos de este activo",
      columns: {
        date: "Fecha",
        side: "Tipo",
        quantity: "Uds",
        price: "Precio",
        amount: "Importe",
      },
      buy: "Compra",
      sell: "Venta",
      empty: "Sin movimientos.",
    },
    notFound: {
      title: "Instrumento no encontrado",
      body: "No hay ningún instrumento con ese identificador.",
    },
  },
} as const;

const SLEEVE_LABELS: Record<Sleeve, string> = {
  CORE: "Core",
  TRADING: "Trading",
};

const TYPE_LABELS: Record<InstrumentType, string> = {
  ETF: "ETF",
  STOCK: "Acción",
  CRYPTO: "Cripto",
  BOND: "Bono",
  COMMODITY: "Materia prima",
  CASH: "Efectivo",
};

export function sleeveLabel(sleeve: Sleeve): string {
  return SLEEVE_LABELS[sleeve];
}

export function instrumentTypeLabel(type: InstrumentType): string {
  return TYPE_LABELS[type];
}

export const DASH = "—";
