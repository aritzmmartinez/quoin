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
    instruments: "Instrumentos",
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
  pagination: {
    label: "Paginación",
    previous: "Página anterior",
    next: "Página siguiente",
    status: (page: number, count: number): string => `${page} / ${count}`,
    range: (from: number, to: number, total: number): string =>
      `${from}–${to} de ${total}`,
  },
  summary: {
    title: "Resumen",
    hero: {
      label: "Valor total de la cartera",
      rangeLabel: (range: string): string => `en ${range}`,
      allTimeLabel: "desde el inicio",
      unpriced: (count: number): string =>
        count === 1
          ? "1 posición sin valorar, excluida del total"
          : `${count} posiciones sin valorar, excluidas del total`,
      empty: "Aún no hay posiciones valoradas.",
    },
    chart: {
      title: "Evolución de la cartera",
      value: "Valor",
      invested: "Aportado",
      building: "Se necesitan al menos dos puntos para dibujar la evolución.",
    },
    stats: {
      invested: {
        label: "Total aportado",
        sub: "Coste de las posiciones abiertas",
      },
      unrealized: { label: "P&L latente", sub: "Valor menos aportado" },
      realized: { label: "P&L realizado", sub: "Beneficio de ventas cerradas" },
      positions: { label: "Posiciones", sub: "Abiertas y valoradas" },
    },
    allocation: {
      title: "Asignación",
      link: "Ver detalle",
      empty: "Sin datos de asignación.",
    },
    top: {
      title: "Top posiciones",
      link: "Ver cartera",
      empty: "Sin posiciones valoradas.",
    },
  },
  allocation: {
    intro:
      "Posición directa + peso dentro de tus ETFs (look-through). El tramo sólido de la barra es lo que compraste tú; el apagado viaja dentro de un fondo.",
    title: "Exposición real por valor",
    thresholdMark: (weight: string): string => `\u250a umbral ${weight}`,
    stats: {
      total: "Total resuelto",
      leaves: "Hojas resueltas",
      unresolved: "Sin desglosar",
      tail: (count: number): string => `Cola (${count} hojas < 0,5 %)`,
      negativeUnresolved:
        "El «sin desglosar» sale negativo porque alguno de tus fondos lleva caja negativa: sus posiciones suman más del 100 %.",
    },
    kinds: {
      COMPANY: "empresa",
      COMMODITY: "materia prima",
      CRYPTO: "cripto",
      UNRESOLVED: "sin desglosar",
    },
    splitBoth: (direct: string, via: string): string =>
      `${direct} directa \u00b7 ${via} vía ETFs`,
    splitDirect: "posición directa",
    splitVia: "vía ETFs",
    direct: "posición directa",
    insideFund: (weight: string): string => `${weight} del fondo`,
    empty:
      "Sin exposición que mostrar. Importa operaciones y sincroniza precios.",
    reading: {
      title: "Lectura",
      lead: "Tu mayor concentración es ",
      isA: ": un ",
      breakdown: (direct: string, via: string): string =>
        ` de la cartera \u2014 ${direct} en posición directa y ${via} a través de tus ETFs.`,
      allDirect: " de la cartera, toda en posición directa.",
      allVia: " de la cartera, toda a través de tus ETFs.",
      over: (threshold: string): string => `Supera tu umbral del ${threshold}.`,
      viaNote:
        "La parte que va dentro de un fondo indexado no se puede recortar sin salirte del índice.",
      top3: "Top 3 exposiciones",
      analysed: "Valores analizados",
      threshold: "Umbral configurado",
      empty: "Todavía no hay exposición resuelta que leer.",
    },
  },
  holdings: {
    drop: "Arrastra aquí el CSV de posiciones del fondo",
    dropHint:
      "Sirve el fichero tal cual lo descargas del emisor: no hace falta limpiarlo.",
    unreadable: "No se ha podido leer el fichero.",
    saveFailed: "El fichero se ha leído bien, pero ha fallado al guardar.",
    qualifier: (column: string): string =>
      `Un mismo ticker puede ser dos empresas en plazas distintas, así que se distinguen por «${column}».`,
    leaves: "posiciones detectadas",
    covered: "Cubierto",
    residual: "Residuo",
    asOf: "Fecha del dato:",
    folded: (count: number): string =>
      count === 1
        ? "1 fila sin identidad va al residuo"
        : `${count} filas sin identidad van al residuo`,
    negativeResidual:
      "El residuo es negativo porque el fondo lleva caja negativa: sus posiciones suman más del 100%. No es un error.",
    columns: {
      identity: "Identidad",
      name: "Nombre",
      weight: "Peso",
    },
    detected: "Detectado",
    correct: "No es correcto",
    showing: (shown: number, total: number): string =>
      `Primeras ${shown} de ${total}, por peso`,
    showAll: (total: number): string => `Ver las ${total}`,
    showLess: "Ver menos",
    filter: "Buscar por nombre o identidad…",
    noMatches: "Ninguna coincide.",
    confirm: "Importar",
    importing: "Importando…",
    cancel: "Cancelar",
    replaces: "Sustituye la composición anterior de este fondo.",
    summary: (count: number, covered: string): string =>
      `${count} posiciones · ${covered}`,
    none: "Sin composición",
    import: "Importar CSV",
    onlyEquityFunds: "Solo para fondos de renta variable.",
    notAFund: "Este instrumento no es un fondo de renta variable.",
  },
  instruments: {
    title: "Instrumentos",
    intro:
      "Tu bróker no dice qué es realmente cada fondo: Trade Republic etiqueta como FUND tanto un ETF de renta variable como un ETC de oro físico. Las acciones y la cripto se resuelven solas por su tipo; los ETC y los fondos de bonos los clasificas aquí, una vez. Esta clasificación vive solo en tu base de datos local y la ingesta nunca la pisa.",
    unmappedHint: (count: number): string =>
      count === 1
        ? "1 instrumento sigue con el valor por defecto y queda sin desglosar."
        : `${count} instrumentos siguen con el valor por defecto y quedan sin desglosar.`,
    columns: {
      instrument: "Instrumento",
      exposure: "Exposición",
      leaf: "Hoja",
      resolvesTo: "Resuelve a",
      composition: "Composición",
      held: "Valor",
    },
    defaultOption: "(por defecto del tipo)",
    leafPlaceholder: "XAU, BTC…",
    leafRequired: "Esta clase necesita una hoja (p. ej. XAU).",
    invalid: "Datos no válidos.",
    save: "Guardar",
    saving: "…",
    saved: "Guardado",
    closed: "Cerrada",
    empty: "Sin instrumentos. Importa tus operaciones con pnpm ingest.",
  },
  movements: {
    title: "Movimientos",
    summary: (count: number, net: string): string =>
      `${count} ${count === 1 ? "movimiento" : "movimientos"} · ${net} de flujo neto`,
    columns: {
      date: "Fecha",
      type: "Tipo",
      instrument: "Instrumento",
      quantity: "Uds",
      price: "Precio",
      costs: "Costes",
      amount: "Importe",
    },
    types: {
      BUY: "Compra",
      SELL: "Venta",
      DIVIDEND: "Dividendo",
      DEPOSIT: "Ingreso",
      WITHDRAWAL: "Retirada",
      INTEREST: "Intereses",
    },
    empty: "Sin movimientos.",
    emptyScreen: {
      title: "Sin movimientos todavía",
      body: "Importa tus operaciones con la CLI (pnpm ingest) para ver aquí el ledger completo.",
    },
    amountHint:
      "El importe es el flujo de caja real: comisiones incluidas y retenciones descontadas.",
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
    sort: {
      by: (column: string): string => `Ordenar por ${column}`,
      asc: "orden ascendente",
      desc: "orden descendente",
    },
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
