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
  basis: {
    label: "Base de cálculo",
    nominal: "Nominal",
    real: "Real",
    nominalHint: "Euros corrientes, sin ajustar por inflación",
    realHint: "Euros ajustados por el IPC",
    reference: (period: string): string => `en euros de ${period}`,
    synced: (relative: string): string => `IPC actualizado ${relative}`,
    neverSynced: "IPC sin fecha de actualización",
    perFlow:
      "Cada aportación se ajusta con el IPC de su propio mes, no el total de golpe.",
    lag: "El valor de mercado es el de hoy: el IPC del mes en curso aún no está publicado, así que la referencia va unas semanas por detrás.",
    noIndex:
      "No hay datos de IPC guardados. Ejecuta pnpm ipc:sync para descargarlos del INE.",
    gaps: (periods: string): string =>
      `Faltan datos de IPC para ${periods}. No se ajusta nada: rellenar un hueco por interpolación inventaría un nivel de precios que nadie ha medido. Vuelve a ejecutar pnpm ipc:sync.`,
    showingNominal: "Se muestran importes nominales.",
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
    returns: {
      twr: { label: "TWR", sub: "ponderada por tiempo" },
      mwr: { label: "MWR / TIR", sub: "ponderada por dinero" },
      unavailable: "sin solución",
      note: "El TWR mide cómo lo han hecho los activos; el MWR (TIR) mide cómo lo ha hecho tu dinero. Aportando poco a poco divergen a propósito: la mayor parte del capital lleva menos tiempo invertido, así que una subida antigua pesa entera en el TWR y casi nada en el MWR.",
      nominal:
        "Ambas se calculan siempre en euros nominales, aunque el resto de la pantalla esté en poder adquisitivo de hoy.",
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
    views: {
      label: "Vista",
      exposicion: "Exposición",
      rebalanceo: "Rebalanceo",
    },
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
  rebalance: {
    title: "Rebalanceo por aportación",
    intro:
      "Dónde poner la próxima aportación para acercarte al objetivo sin vender nada. Vender realiza ganancia y tributa; aportar no, así que el reparto solo mueve dinero nuevo hacia lo que va por debajo de su peso.",
    amount: "Próxima aportación",
    amountPlaceholder: "500",
    threshold: "Umbral de desvío (%)",
    submit: "Calcular",
    noTarget:
      "Todavía no hay ningún objetivo vigente. Define tu plan de aportación en Objetivo y vuelve aquí.",
    prompt: "Escribe cuánto vas a aportar y verás el reparto sugerido.",
    hypothesis:
      "Es una sugerencia, no una orden: no se guarda nada ni se ejecuta ninguna compra.",
    columns: {
      instrument: "Instrumento",
      amount: "Aportar",
      current: "Valor actual",
      drift: "Desvío",
    },
    targetSuffix: (weight: string): string => `${weight} objetivo`,
    driftArrow: (before: string, after: string): string =>
      `${before} → ${after}`,
    total: "Total repartido",
    overThreshold: (drift: string, threshold: string): string =>
      `Tu cartera acumula un ${drift} de desvío, por encima de tu umbral del ${threshold}.`,
    underThreshold: (drift: string, threshold: string): string =>
      `Tu cartera acumula un ${drift} de desvío, dentro de tu umbral del ${threshold}.`,
    driftHint:
      "El desvío es lo que se separa cada línea de su peso objetivo, y el total es la suma de todas. El umbral es informativo: el reparto siempre rellena lo que va por debajo.",
    worsening: "Se aleja del objetivo aun recibiendo aportación",
    worseningHint:
      "Esta línea recibe aportación y aun así se aleja de su objetivo, porque otra posición del plan está sobreponderada y no se vende: el hueco que ocupa de más no se puede rellenar con dinero nuevo, solo diluir. Aportaciones mayores lo corrigen; venderla tributaría.",
    unpriced: (names: string): string =>
      `Sin precio utilizable, así que quedan fuera del reparto: ${names}. Un precio que falta no es un valor de cero — ejecuta pnpm prices:sync antes de fiarte del reparto.`,
    offPlan: (count: number): string =>
      count === 1
        ? "1 posición en cartera, fuera del plan"
        : `${count} posiciones en cartera, fuera del plan`,
    offPlanNote:
      "Tienes posición en esto y tu objetivo vigente no lo nombra. No recibe aportación: meter dinero nuevo ahí no es rebalancear, es cambiar de plan, y eso se hace en Objetivo.",
    empty:
      "Ninguna línea del objetivo se puede repartir todavía. Importa operaciones y sincroniza precios.",
  },
  holdings: {
    drop: "Arrastra aquí el CSV o Excel de posiciones del fondo",
    dropHint:
      "Sirve el fichero tal cual lo descargas del emisor, CSV o .xlsx: no hace falta limpiarlo ni convertirlo.",
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
    import: "Importar composición",
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
  target: {
    title: "Objetivo",
    intro:
      "Tu plan de aportación mensual. Los importes son el dato; el peso se deriva de ellos. Un objetivo no se edita: cuando el plan cambia, guardas una versión nueva con su fecha de vigencia, para que siga sabiéndose qué objetivo estaba vigente en cada fecha.",
    none: "Aún no hay ningún objetivo guardado. Crea la primera versión abajo o usa pnpm target:set.",
    activeFrom: (date: string): string => `Vigente desde el ${date}`,
    columns: {
      instrument: "Instrumento",
      amount: "Importe mensual",
      weight: "Peso",
    },
    total: "Total mensual",
    notHeld: "Sin posición todavía",
    notImported: "Sin importar todavía",
    history: {
      title: "Versiones",
      active: "Vigente",
      summary: (lines: number, total: string): string =>
        `${lines} ${lines === 1 ? "línea" : "líneas"} · ${total} al mes`,
      delete: "Eliminar",
      deleting: "…",
      empty: "Sin versiones.",
    },
    form: {
      title: "Nueva versión",
      name: "Nombre",
      namePlaceholder: "Plan de aportación",
      activeFrom: "Vigente desde",
      note: "Nota",
      notePlaceholder: "Por qué cambia el plan",
      lines: "Líneas",
      linesHint:
        "Una por línea: identificador del instrumento e importe mensual. Puedes incluir un instrumento que aún no tengas en cartera.",
      linesPlaceholder: "IE00B3RBWM25 300\nIE00BKM4GZ66 75",
      submit: "Guardar versión",
      saving: "Guardando…",
      invalid: "Datos no válidos.",
      idMismatch: (pairs: string): string =>
        `No se ha guardado nada. Estos identificadores no coinciden con los importados: ${pairs}. Una línea se une a su instrumento por identificador exacto, así que nunca resolverían.`,
      saveFailed: "No se ha podido guardar la versión.",
    },
  },
  projection: {
    title: "Proyección",
    intro:
      "Si sigues aportando según tu plan vigente, dónde podría acabar la cartera. No es una previsión: es un remuestreo de los meses que tus propios instrumentos ya han vivido. Por eso responde con un rango y no con una cifra — una única línea fingiría conocer el futuro.",
    noTarget:
      "No hay ningún objetivo vigente que proyectar. Define tu plan de aportación en Objetivo y vuelve aquí.",
    fromTarget: "simula tu plan actual →",
    noHistory:
      "Ninguna línea de tu plan tiene histórico de precios, así que no hay nada que remuestrear. Mapea sus símbolos con pnpm prices:map y descarga el histórico con pnpm prices:backfill.",
    noWindow:
      "Las líneas de tu plan no comparten ni un solo mes de histórico, así que no hay ventana común que remuestrear. Amplía el histórico más corto con pnpm prices:backfill.",
    thinWindow: {
      title: "Sin cifras todavía: la ventana es demasiado corta",
      body: (months: number, minimum: number, instrument: string): string =>
        `Tus líneas comparten ${months} ${months === 1 ? "mes" : "meses"} de histórico y hacen falta ${minimum}. La ventana la recorta ${instrument}, que es la que menos historial tiene.`,
      why: (months: number, years: number): string =>
        `No es un aviso que puedas saltarte: remuestrear ${months} meses de un tramo de mercado concreto y componerlos ${years * 12} meses hacia delante no proyecta tu cartera, extrapola ese tramo. Un número así se lee como una previsión por mucho que lleve una nota debajo, y decidir cuánto aportas sobre él sería decidirlo sobre esos ${months} meses.`,
      fix: (instrument: string): string =>
        `Ejecuta pnpm prices:backfill sobre ${instrument} (por defecto trae 5 años) y vuelve. En cuanto la ventana llegue al mínimo, la pantalla da cifras.`,
    },
    form: {
      horizon: "Horizonte (años)",
      contribution: "Aportación mensual",
      goal: "Objetivo (opcional)",
      goalPlaceholder: "1.000.000",
      submit: "Proyectar",
      detail: "Ver más detalle",
      detailHint:
        "Añade los cuartiles (percentiles 25 y 75) entre los tres escenarios. No vuelve a simular: son dos lecturas más de la misma distribución ya calculada.",
    },
    bands: {
      title: (years: number): string =>
        years === 1 ? "Dentro de 1 año" : `Dentro de ${years} años`,
      p10: "Escenario malo",
      p25: "Cuartil bajo",
      p50: "Escenario central",
      p75: "Cuartil alto",
      p90: "Escenario bueno",
      p10Hint:
        "Percentil 10: una de cada diez simulaciones acaba por debajo de esta cifra.",
      p25Hint:
        "Percentil 25: una de cada cuatro simulaciones acaba por debajo de esta cifra. Entre el escenario malo y el central está la mitad del riesgo que no se ve con tres cifras.",
      p75Hint:
        "Percentil 75: solo una de cada cuatro simulaciones acaba por encima de esta cifra.",
      p50Hint:
        "Percentil 50: la mitad de las simulaciones acaba por encima y la mitad por debajo. Es la mediana, no un promedio.",
      p90Hint:
        "Percentil 90: solo una de cada diez simulaciones acaba por encima de esta cifra. Es la que se estima con menos caminos, así que es la que más se mueve al cambiar de semilla.",
      real: (amount: string): string => `${amount} en euros de hoy`,
      noReal:
        "Sin datos de IPC no se puede expresar en euros de hoy. Ejecuta pnpm ipc:sync.",
    },
    contributed: (amount: string): string =>
      `De ahí, ${amount} sale de tu bolsillo: lo que ya tienes simulado más todas las aportaciones del horizonte.`,
    method: {
      title: "Cómo se ha calculado",
      window: (months: number, instrument: string): string =>
        `Se remuestrean ${months} meses de histórico, la ventana que comparten todas las líneas del plan. La recorta ${instrument}, que es la que menos historial tiene: rellenar los meses que le faltan sería inventarlos.`,
      drift: (annual: string, years: number): string =>
        `Esa ventana compone un ${annual} anual, y es la deriva que el remuestreo extrapola ${years} ${years === 1 ? "año" : "años"} hacia delante. Si te parece alta para un plazo largo, lo es: mira ese número antes que el titular.`,
      simulations: (count: number, seed: number): string =>
        `${count} simulaciones, semilla ${seed}: los mismos datos dan siempre el mismo resultado.`,
      tailNoise: (simulations: number, months: number): string =>
        `De las tres cifras, la del escenario bueno es la menos firme: cambiando solo la semilla se mueve unas cuatro veces más que las otras dos. No es la ventana quien la limita — las tres se estrechan al mismo ritmo al subir las simulaciones —, es que una cola se estima con muchos menos caminos que la mediana. Se arregla con más simulaciones, solo que hace falta más de un orden de magnitud sobre las ${simulations} de aquí, y eso encarecería cada respuesta a un objetivo. Sería reproducibilidad, no acierto: lo que limitan ${months} meses de muestra es la exactitud de las tres cifras a la vez, no la firmeza de esta.`,
      inflation: (annual: string): string =>
        `El importe en euros de hoy descuenta un ${annual} anual, la media histórica del IPC. No hay IPC futuro, así que se asume que la inflación también se parece a su pasado.`,
      fixedWeights:
        "Los pesos del plan se mantienen fijos durante todo el horizonte y las aportaciones entran a principio de mes.",
      twoPots: (offPlan: string): string =>
        `La parte de fuera del plan que llega a la ventana (${offPlan}) se simula aparte, con sus propios rendimientos y sin recibir aportaciones — prestarle la varianza del plan a otra cosa sería inventarse su riesgo. Ambos botes avanzan sobre el mismo mes sorteado, así que un mal mes lo es para toda la cartera a la vez.`,
      allOffPlanExcluded:
        "El bote de fuera del plan queda vacío, y no porque no tengas nada fuera del plan: es que nada de lo que tienes ahí llega a la ventana, así que todo ello queda sin simular — lo tienes detallado arriba, con su importe.",
      noOffPlan:
        "Todo lo que tienes en cartera lo nombra el plan, así que no hay nada que simular aparte.",
    },
    excluded: (names: string, coverage: string): string =>
      `Sin histórico de precios, así que quedan fuera de la simulación: ${names}. Los pesos restantes se reparten el 100%, de modo que lo proyectado es el ${coverage} de tu plan, no el plan entero. Ejecuta pnpm prices:backfill antes de fiarte del rango.`,
    unsimulated: (names: string, amount: string): string =>
      `${amount} en posiciones fuera del plan con menos histórico que la ventana: ${names}. No entran en las cifras de arriba ni se suman al final. Congelarlas veinte años a un 0% sería una afirmación tan falsa como prestarles el rendimiento del plan; que el plan fije la ventana es lo que evita que una compra reciente la encoja para todo lo demás.`,
    unpriced: (count: number): string =>
      count === 1
        ? "1 posición sin precio utilizable queda fuera del valor de partida. Un precio que falta no es un valor de cero."
        : `${count} posiciones sin precio utilizable quedan fuera del valor de partida. Un precio que falta no es un valor de cero.`,
    goal: {
      title: (amount: string): string => `Para llegar a ${amount}`,
      contribution: (amount: string, years: number): string =>
        `Aportando ${amount} al mes, el escenario central alcanza el objetivo en ${years === 1 ? "1 año" : `${years} años`}.`,
      contributionUnreachable:
        "No hay aportación mensual que lleve el escenario central hasta ahí en este horizonte. Alarga el plazo o baja el objetivo.",
      horizon: (amount: string, horizon: string): string =>
        `Con ${amount} al mes, el escenario central llega al objetivo en ${horizon}.`,
      horizonNow: "Ya lo has alcanzado: tu cartera vale más que el objetivo.",
      horizonUnreachable:
        "Con esa aportación el escenario central no llega al objetivo ni en un siglo.",
      caveat:
        "Ambas respuestas apuntan a la mediana. Que el escenario central llegue no significa que vayas a llegar: la mitad de las simulaciones acaban por debajo.",
    },
    horizonLabel: (months: number): string => {
      const years = Math.floor(months / 12);
      const rest = months % 12;
      const y = years === 1 ? "1 año" : `${years} años`;
      const m = rest === 1 ? "1 mes" : `${rest} meses`;
      if (years === 0) return m;
      if (rest === 0) return y;
      return `${y} y ${m}`;
    },
    hypothesis:
      "Es una simulación, no una promesa: no se guarda nada y ningún rendimiento pasado obliga al futuro.",
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
  realized: {
    title: "Realizado",
    intro:
      "Cada venta cerrada, con el coste que consumió en el momento de venderla. Las comisiones de compra ya van dentro del coste; las de venta se restan del bruto.",
    avcoWarning:
      "Cálculo AVCO (coste medio ponderado), el mismo criterio que la cartera. No coincide con el criterio fiscal FIFO: en la declaración cada venta se empareja con las compras más antiguas, así que el resultado por operación será otro.",
    summary: (count: number, result: string): string =>
      `${count} ${count === 1 ? "venta" : "ventas"} · ${result} de resultado`,
    columns: {
      date: "Fecha",
      name: "Instrumento",
      quantity: "Uds",
      price: "Precio",
      grossAmount: "Bruto",
      fees: "Comisiones",
      costBasis: "Coste",
      realizedPnL: "Resultado",
      returnPct: "%",
      holdingDays: "Días",
    },
    days: (count: number): string => `${count} d`,
    sales: (count: number): string =>
      `${count} ${count === 1 ? "venta" : "ventas"}`,
    total: "Total",
    empty: {
      title: "Sin ventas todavía",
      body: "Cuando vendas algo, aquí aparecerá el resultado de cada operación.",
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
