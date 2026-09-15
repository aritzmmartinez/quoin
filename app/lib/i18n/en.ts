import type { ExposureKind, InstrumentType, Thesis } from "~/core/domain";

import type { Copy } from "./types";

const THESIS_LABELS: Record<Thesis, string> = {
  CORE: "Core",
  CONVICTION: "Conviction",
  TACTICAL: "Tactical",
};

const THESIS_DESCRIPTIONS: Record<Thesis, string> = {
  CORE: "Indexed core: what holds the portfolio up and does not get touched.",
  CONVICTION:
    "A single bet I mean to hold for years — not an index, and not a trade.",
  TACTICAL: "A position taken with the exit already in mind.",
};

const TYPE_LABELS: Record<InstrumentType, string> = {
  ETF: "ETF",
  STOCK: "Stock",
  CRYPTO: "Crypto",
  BOND: "Bond",
  COMMODITY: "Commodity",
  CASH: "Cash",
};

const EXPOSURE_KIND_LABELS: Record<ExposureKind, string> = {
  COMPANY: "Stock",
  EQUITY_FUND: "Equity fund",
  BOND_FUND: "Bond fund",
  COMMODITY: "Commodities",
  CRYPTO: "Crypto",
};

export const en: Copy = {
  common: {
    close: "Close",
  },
  notFound: {
    title: "Page not found",
    body: "That address does not match any Quoin screen.",
    home: "Go to the summary",
  },
  select: {
    empty: "No results",
  },
  datePicker: {
    placeholder: "Pick a date",
    open: "Open calendar",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    today: "Today",
    clear: "Clear",
    weekdays: ["M", "T", "W", "T", "F", "S", "S"],
    weekdayNames: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
  },
  nav: {
    brand: "Quoin",
    overview: "Summary",
    portfolio: "Portfolio",
    allocation: "Allocation",
    movements: "Movements",
    instruments: "Instruments",
    soon: "Soon",
    version: (v: string): string => `v${v}`,
    groups: {
      portfolio: "Portfolio",
      analysis: "Analysis",
      system: "System",
    },
    collapse: "Collapse the menu",
    expand: "Expand the menu",
  },
  theme: {
    label: "Theme",
    dark: "Dark",
    light: "Light",
    system: "System",
  },
  settings: {
    title: "Settings",
    soon: "Coming soon",
    appearance: {
      title: "Appearance",
      desc: "How Quoin looks on this device.",
      theme: { label: "Theme", hint: "Dark is Quoin's primary theme" },
    },
    preferences: {
      title: "Preferences",
      desc: "Number formatting and the language of the interface.",
      currency: {
        label: "Display currency",
        hint: "Converts every amount into this currency",
      },
      language: { label: "Language" },
    },
    portfolio: {
      title: "Portfolio",
      desc: "Parameters used by the Allocation and Opportunity cost analyses.",
      threshold: {
        label: "Concentration threshold",
        hint: "A position above this is marked as concentrated",
      },
      benchmark: {
        label: "Benchmark index",
        hint: "Used in Opportunity cost",
        search: "Search ticker or name",
      },
    },
  },
  glossary: {
    open: "Glossary of terms",
    title: "Glossary",
    terms: [
      {
        term: "Unrealised and realised result",
        short: "What your investments have made, in euros.",
        detail:
          "The unrealised result is what you would make if you sold today what you still hold: current value minus what you contributed. The realised one covers what you already sold, and is closed. They are shown apart because they answer different questions: «how is what I hold doing» and «how much have I actually made». «Contributed» includes fees, because the acquisition cost includes them for tax purposes and leaving them out would flatter the return.",
      },
      {
        term: "TER",
        short: "What managing your funds costs you a year, as a percentage.",
        detail:
          "A 0.20% TER on €10,000 is €20 a year, taken straight out of the fund's value. It never shows up as a charge on your statement, because the price the fund quotes is already net of that cost. It is the main reason two funds tracking the same index can return slightly different amounts.",
      },
      {
        term: "TWR",
        short: "Measures how the assets did, without fees.",
        detail:
          "It is a pure price mark: how your portfolio would have behaved if you had invested everything at once at the start, regardless of when each euro went in or what each trade cost you. That is why it diverges from MWR, which does account for both.",
      },
      {
        term: "MWR / IRR",
        short: "Measures how your money did, not the asset.",
        detail:
          "It weights each contribution by how long it has been invested. If you put in €1,000 three years ago and another €1,000 last month, a rise two years ago weighs heavily in TWR, because the asset had been rising for a while, but barely at all in your MWR, because most of your money has only just arrived. Contributing bit by bit makes them diverge on purpose. It is not an error — they are different questions.",
      },
      {
        term: "AVCO",
        short:
          "Weighted average cost: your average purchase price, recomputed every time you buy more.",
        detail:
          "If you buy 10 shares at €100 and then 10 more at €120, your AVCO is €110. On a sale, Quoin uses that average cost to work out the gain, and it is the basis of your portfolio view and of Realized. It is not the one the tax return requires.",
      },
      {
        term: "FIFO",
        short: "«First in, first out», the mandatory tax basis.",
        detail:
          "Unlike AVCO, FIFO matches each sale against the oldest purchases rather than an average price. With the same example, 10 at €100 and 10 at €120, if you sell 10, FIFO says you sold the first ones, at €100, where AVCO would have used €110. That is why the result of a sale can differ between your normal view and the Tax tab. Both are legitimate bases for different questions.",
      },
      {
        term: "Look-through exposure",
        short: "Seeing what is really inside your funds, not just their names.",
        detail:
          "«Holding a global index fund» does not say much on its own. What matters is which companies it contains and at what weight. Looking through, Quoin breaks each fund down into its real constituents and adds them to your direct positions, so you see your true exposure to each company and not just to the wrapper.",
      },
      {
        term: "Overlap",
        short: "How much the same companies repeat across two of your funds.",
        detail:
          "Two funds with different names can share a large part of their constituents. A world fund and an emerging-markets one, for instance, both hold TSMC or Samsung. If the overlap is high, holding two funds gives you less real diversification than it looks.",
      },
      {
        term: "Concentration threshold",
        short: "The percentage above which a position counts as too large.",
        detail:
          "There is no universal number, but 10% to 15% is a common alarm reference for a single position. Quoin marks in red whatever exceeds the threshold you set, so you decide whether it is a risk taken deliberately or something to correct.",
      },
      {
        term: "Rebalancing and drift",
        short: "How far your portfolio has drifted from the split you planned.",
        detail:
          "If your plan was 70% equities and 30% gold, and the rises have left it at 80 and 20, that difference is the drift. Rebalancing corrects it, and Quoin does so without selling: it directs your next contribution towards whatever has fallen behind, so as not to trigger unnecessary tax.",
      },
      {
        term: "Opportunity cost",
        short:
          "What would have happened if you had always bought the index instead of your assets.",
        detail:
          "Quoin replays your own dates and amounts as if every contribution had gone into a benchmark index. The difference tells you whether picking specific assets paid off against simply indexing.",
      },
      {
        term: "Hedged currency",
        short: "A fund that neutralises the effect of the exchange rate.",
        detail:
          "An unhedged dollar gold fund depends on gold and on the dollar-euro rate alike. A currency-hedged one cancels that second effect with derivatives, so your result tracks the underlying asset closely, at the price of an extra cost usually already inside its TER.",
      },
      {
        term: "Nominal versus real",
        short:
          "Nominal is your euros as they are. Real is adjusted for inflation.",
        detail:
          "€1,000 made today is not worth what it was three years ago, because prices have risen in between. Real mode discounts each contribution by the CPI of its own month, so the return reflects actual purchasing power and not just the figure on screen.",
      },
    ],
  },
  range: {
    label: "Time range",
    m1: "1M",
    m6: "6M",
    y1: "1Y",
    all: "All",
  },
  basis: {
    label: "Calculation basis",
    about: "About the real basis",
    nominal: "Nominal",
    real: "Real",
    nominalHint: "Euros as they were, not adjusted for inflation",
    realHint: "Euros adjusted by the CPI",
    reference: (period: string): string => `in ${period} euros`,
    synced: (relative: string): string => `CPI updated ${relative}`,
    neverSynced: "CPI has no update date",
    perFlow:
      "Each contribution is adjusted by the CPI of its own month, not the total in one go.",
    lag: "Market value is today's: this month's CPI is not published yet, so the reference runs a few weeks behind.",
    maybeBehind:
      "The last stored CPI is several weeks old. INE may have published a month you do not have yet; the app cannot know without asking again.",
    noIndex:
      "There is no CPI data stored, so nothing can be adjusted for inflation.",
    gaps: (periods: string): string =>
      `CPI data is missing for ${periods}. Nothing is adjusted: filling a gap by interpolation would invent a price level nobody measured.`,
    showingNominal: "Nominal amounts are shown.",
    sync: {
      action: "Sync CPI",
      loading: "Syncing CPI…",
      upToDate: "The CPI was already up to date.",
      added: (n: number): string =>
        n === 1 ? "1 month of CPI added" : `${n} months of CPI added`,
      error: "The CPI could not be synced.",
      rebase: (series: string): string =>
        `${series}: INE changed the base year. Replace the series with pnpm ipc:sync --force-rebase.`,
    },
  },
  pagination: {
    label: "Pagination",
    previous: "Previous page",
    next: "Next page",
    status: (page: number, count: number): string => `${page} / ${count}`,
    range: (from: number, to: number, total: number): string =>
      `${from}–${to} of ${total}`,
  },
  summary: {
    title: "Summary",
    hero: {
      label: "Total portfolio value",
      rangeLabel: (range: string): string => `in ${range}`,
      allTimeLabel: "since inception",
      unpriced: (count: number): string =>
        count === 1
          ? "1 unpriced position, excluded from the total"
          : `${count} unpriced positions, excluded from the total`,
      empty: "No priced positions yet.",
    },
    chart: {
      title: "Portfolio over time",
      value: "Value",
      invested: "Contributed",
      building: "At least two points are needed to draw the series.",
    },
    stats: {
      invested: {
        label: "Total contributed",
        sub: "Cost of the open positions",
      },
      unrealized: {
        label: "Unrealised result",
        sub: "Value minus contributed",
      },
      realized: {
        label: "Realised result",
        sub: "Result of the closed sales",
      },
      positions: { label: "Positions", sub: "Open and priced" },
      opportunity: {
        label: "Against the index",
        sub: (symbol: string): string => `Against ${symbol}`,
      },
      ter: {
        label: "Weighted TER",
        sub: (annual: string): string => `${annual} a year in management`,
      },
    },
    returns: {
      twr: { label: "TWR", sub: "time-weighted" },
      mwr: { label: "MWR / IRR", sub: "money-weighted" },
      unavailable: "no solution",
      note: "TWR measures how the assets did and MWR (IRR) measures how your money did. Contributing bit by bit makes them diverge on purpose: most of the capital has been invested for less time, so an old rise weighs fully in TWR and barely at all in MWR.",
      nominal:
        "Both are always computed in nominal euros, even when the rest of the screen is in today's purchasing power.",
    },
    allocation: {
      title: "Allocation",
      link: "View allocation",
      empty: "No allocation data.",
    },
    top: {
      title: "Largest positions",
      link: "View portfolio",
      empty: "No priced positions.",
    },
  },
  allocation: {
    views: {
      label: "View",
      exposure: "Exposure",
      rebalance: "Rebalancing",
      currency: "Currency",
      overlap: "Overlap",
    },
    intro:
      "Your direct positions plus what you carry inside your ETFs, looking through to what each fund holds. The solid part of the bar is what you bought yourself. The muted part travels inside a fund.",
    title: "Look-through exposure by value",
    thresholdMark: "┊ threshold",
    thresholdLabel: "Concentration threshold (%)",
    stats: {
      total: "Total resolved",
      leaves: "Resolved leaves",
      unresolved: "Not broken down",
      tail: (count: number): string => `Tail (${count} leaves < 0.5%)`,
      negativeUnresolved:
        "«Not broken down» comes out negative because one of your funds carries negative cash: its holdings add up to more than 100%.",
    },
    kinds: {
      COMPANY: "company",
      COMMODITY: "commodity",
      CRYPTO: "crypto",
      UNRESOLVED: "not broken down",
    },
    splitBoth: (direct: string, via: string): string =>
      `${direct} direct · ${via} via ETFs`,
    splitDirect: "direct position",
    splitVia: "via ETFs",
    direct: "direct position",
    insideFund: (weight: string): string => `${weight} of the fund`,
    empty: "No exposure to show. Import trades and sync prices.",
    reading: {
      title: "Reading",
      lead: "Your largest concentration is ",
      isA: ": a ",
      breakdown: (direct: string, via: string): string =>
        ` of the portfolio: ${direct} held directly and ${via} through your ETFs.`,
      allDirect: " of the portfolio, all of it held directly.",
      allVia: " of the portfolio, all of it through your ETFs.",
      over: (threshold: string): string =>
        `It exceeds your ${threshold} threshold.`,
      viaNote:
        "The part that travels inside an index fund cannot be trimmed without leaving the index.",
      top3: "Three largest exposures",
      analysed: "Securities analysed",
      threshold: "Configured threshold",
      empty: "There is no resolved exposure to read yet.",
    },
  },
  currency: {
    title: "Currency exposure",
    intro:
      "Buying NVIDIA on Xetra paying euros does not give you euro exposure: that is the New York price in dollars, converted on the spot. What counts is the currency of each security's primary market, both what you hold directly and what travels inside your funds.",
    stats: {
      base: "In euros",
      foreign: "Outside the euro",
      unresolved: "Undetermined",
    },
    unresolvedLabel: "Undetermined",
    unresolvedTitle: "Why some value stays undetermined",
    unresolvedBody:
      "It is not spread across the known currencies: doing so would invent an exposure you do not have. This is where leaves with no resolved canonical identity land, along with share classes listed in more than one country (no single currency is the answer) and the part of your funds the issuer does not break down.",
    unresolvedFix:
      "Run pnpm identity:resolve --refresh to fill in the identities that have no primary market stored yet.",
    hedged: (count: number): string =>
      count === 1
        ? "1 euro-hedged instrument counts as euro, not as the currency of its underlying."
        : `${count} euro-hedged instruments count as euro, not as the currency of their underlying.`,
    empty: "No currency exposure to show. Import trades and sync prices.",
  },
  overlap: {
    title: "Overlap between funds",
    intro:
      "How much of two funds is the same company: for every security both hold, the smaller of their two weights, summed. Two funds with very different names can be buying you the same thing.",
    note: "The weight is each company's weight inside its own fund, not inside your portfolio: overlap is a property of the two funds against each other, not of how much you hold in either.",
    modes: {
      label: "View mode",
      list: "List",
      matrix: "Matrix",
    },
    header: (funds: number, pairs: number): string =>
      `${funds} funds · ${pairs} ${pairs === 1 ? "pair" : "pairs"}`,
    empty:
      "At least two funds with an imported composition and an open position are needed. Drop the holdings CSV onto the fund's row in Instruments. A fund with no composition is left out of the calculation, it does not count as 0%.",
    includeSold: "Include sold funds",
    includeSoldHint:
      "Funds with an imported composition but no open position today. Useful to see how much something you sold would overlap before buying it back.",
    shared: (count: number): string =>
      count === 1 ? "1 company in common" : `${count} companies in common`,
    none: "No company in common: real diversification between these two.",
    top: "Largest contributor",
    contributorPair: (a: string, b: string): string => `${a} · ${b}`,
    matrixHeader: "Each cell is the overlap of the row with the column.",
    matrixLegend:
      "Columns are numbered in the same order as the rows. The diagonal is omitted: a fund against itself is always 100%.",
  },
  rebalance: {
    title: "Rebalancing by contribution",
    intro:
      "Where to put the next contribution to get closer to the target without selling anything. Selling realises a gain and is taxed, contributing is not, so the split only moves new money towards whatever is below its weight.",
    amount: "Next contribution",
    amountPlaceholder: "500",
    threshold: "Drift threshold (%)",
    submit: "Calculate",
    noTarget:
      "There is no target in force yet. Define your savings plan in Target and come back here.",
    prompt:
      "Enter how much you are going to contribute to see the suggested split.",
    hypothesis:
      "It is a suggestion, not an order: nothing is stored and no purchase is made.",
    columns: {
      instrument: "Instrument",
      amount: "Contribute",
      current: "Current value",
      drift: "Drift",
    },
    targetSuffix: (weight: string): string => `${weight} target`,
    driftArrow: (before: string, after: string): string =>
      `${before} → ${after}`,
    total: "Total allocated",
    overThreshold: (drift: string, threshold: string): string =>
      `Your portfolio has accumulated ${drift} of drift, above your ${threshold} threshold.`,
    underThreshold: (drift: string, threshold: string): string =>
      `Your portfolio has accumulated ${drift} of drift, within your ${threshold} threshold.`,
    driftHint:
      "Drift is how far each line sits from its target weight, and the total is the sum of all of them. The threshold is informative: the split always fills whatever is below.",
    worsening: "Drifts further from target even while receiving a contribution",
    worseningHint:
      "This line receives a contribution and still drifts further from its target, because another position in the plan is overweight and is not being sold: the extra room it takes up cannot be filled with new money, only diluted. Larger contributions correct it, and selling it would be taxed.",
    unpriced: (names: string): string =>
      `No usable price, so these are left out of the split: ${names}. A missing price is not a value of zero. Run pnpm prices:sync before trusting the split.`,
    offPlan: (count: number): string =>
      count === 1
        ? "1 position held, outside the plan"
        : `${count} positions held, outside the plan`,
    offPlanNote:
      "You hold this and your target in force does not name it. It receives no contribution: putting new money there is not rebalancing, it is changing the plan, and that is done in Target.",
    empty:
      "No target line can be allocated to yet. Import trades and sync prices.",
  },
  ingest: {
    open: "Import trades",
    title: "Import trades",
    steps: {
      file: "File",
      mapping: "Symbols",
      prices: "Prices",
      done: "Summary",
    },
    stepOf: (current: number, total: number): string =>
      `Step ${current} of ${total}`,
    previous: "Back",
    next: "Next",
    finish: "Close",
    goToStep: (label: string): string => `Back to «${label}»`,
    volatile:
      "The file does not survive a page refresh: reload now and you go back to the first step.",
    drop: "Drop your broker's CSV here",
    dropHint:
      "Trade Republic or Kraken, exactly as you download it. The broker is detected from the file's columns, there is nothing to choose.",
    unreadable: "The file could not be read.",
    unknownBroker:
      "I do not recognise this export. A Trade Republic CSV (with a transaction_id column) or a Kraken one (with a refid column) is expected.",
    failed: "The import failed.",
    analysing: "Analysing the file…",
    importing: "Importing…",
    brokerLabel: (broker: string): string =>
      broker === "kraken" ? "Kraken" : "Trade Republic",
    detected: (broker: string): string => `${broker} detected`,
    change: "Change",
    summary: {
      total: "Trades in the file",
      imported: "New",
      duplicates: "Duplicates",
      instruments: "Instruments",
      discarded: "Discarded",
      errors: "With errors",
      none: "none",
      unsupportedDetails: (count: number): string =>
        count === 1
          ? "View 1 unsupported row"
          : `View ${count} unsupported rows`,
      noInstrument: "No instrument",
    },
    nothingNew:
      "Nothing new to import: every trade in this file was already in the ledger.",
    confirmCount: (count: number): string =>
      count === 1 ? "Import 1 trade" : `Import ${count} trades`,
    appliesNow:
      "The trades are written to the ledger when you press. The following steps only add symbols and prices: closing the wizard afterwards does not undo the import.",
    closeConfirm: {
      body: (count: number): string =>
        count === 1
          ? "1 trade has already been imported and stays in the ledger even if you close now."
          : `${count} trades have already been imported and stay in the ledger even if you close now.`,
      hint: "Any symbols left unmapped can be finished in Instruments.",
      keep: "Carry on with the import",
      close: "Close anyway",
    },
    map: {
      title: "Quote symbols",
      intro:
        "These instruments have no Yahoo symbol yet, so they cannot be valued. Map the euro-denominated line of the right venue and check the implied value before saving.",
      warning:
        "Several venues quote in euros and are still a different fund tracking the same index, or the same fund with a different entitlement per unit. Compare the implied value against what your broker says: currency alone does not catch this, magnitude does.",
      placeholder: "VWCE.DE, BTC-EUR…",
      verify: "Verify",
      verifying: "Verifying…",
      save: "Use this symbol",
      saving: "Saving…",
      saved: "Saved",
      invalid: "Invalid symbol.",
      noQuote: (symbol: string): string =>
        `Yahoo returns no price for ${symbol}. Try another venue (.DE, .MI, .PA, .AS).`,
      price: "Price",
      impliedValue: "Implied value",
      quantity: "Units",
      stale:
        "The timestamp is old: almost always it means the wrong venue, or a very illiquid one.",
      closed:
        "You hold no units of this instrument, so the implied value verifies nothing. Check the venue by hand.",
      removed: (count: number): string =>
        count === 1
          ? "1 price from the previous symbol has been deleted."
          : `${count} prices from the previous symbol have been deleted.`,
      pending: (count: number): string =>
        count === 1
          ? "1 instrument without a symbol"
          : `${count} instruments without a symbol`,
      none: "Every imported instrument already has a symbol.",
      mapped: (done: number, total: number): string =>
        `${done} of ${total} mapped`,
      canContinue:
        "You can continue without mapping them all: any missing symbols can be finished in Instruments.",
    },
    prices: {
      title: "Prices",
      intro:
        "The daily history is downloaded first, then today's quote. Both are needed: the most recent session arrives without a close in the history and only the live quote completes it.",
      range: "History",
      rangeHint:
        "The history feeds the projections: below 60 months the Projection screen shows no figure at all.",
      run: "Download prices",
      running: "Downloading prices…",
      invalid: "Invalid range.",
      nothing: "No new instrument with a symbol to update.",
    },
    done: {
      title: "Import summary",
      imported: (count: number): string =>
        count === 1 ? "1 trade imported" : `${count} trades imported`,
      duplicates: (count: number): string =>
        count === 1 ? "1 duplicate skipped" : `${count} duplicates skipped`,
      discarded: (count: number): string =>
        count === 1 ? "1 row discarded" : `${count} rows discarded`,
      candles: (count: number): string =>
        count === 1 ? "1 historical price" : `${count} historical prices`,
      synced: (count: number): string =>
        count === 1 ? "1 quote for today" : `${count} quotes for today`,
      unmapped: (count: number): string =>
        count === 1
          ? "1 instrument still has no symbol and cannot be valued."
          : `${count} instruments still have no symbol and cannot be valued.`,
      staleWarning: (count: number): string =>
        count === 1
          ? "1 symbol returned an old quote: check the venue."
          : `${count} symbols returned old quotes: check the venues.`,
    },
  },
  holdings: {
    drop: "Drop the fund's holdings CSV or Excel here",
    dropHint:
      "The file works exactly as the issuer publishes it, CSV or .xlsx: there is no need to clean or convert it.",
    unreadable: "The file could not be read.",
    saveFailed: "The file was read correctly, but saving failed.",
    qualifier: (column: string): string =>
      `The same ticker can be two companies on different venues, so they are told apart by «${column}».`,
    leaves: "holdings detected",
    covered: "Covered",
    residual: "Residual",
    asOf: "Data as of:",
    folded: (count: number): string =>
      count === 1
        ? "1 row with no identity folds into the residual"
        : `${count} rows with no identity fold into the residual`,
    negativeResidual:
      "The residual is negative because the fund carries negative cash: its holdings add up to more than 100%. This is not an error.",
    columns: {
      identity: "Identity",
      name: "Name",
      weight: "Weight",
    },
    detected: "Detected",
    correct: "Not correct",
    showing: (shown: number, total: number): string =>
      `First ${shown} of ${total}, by weight`,
    showAll: (total: number): string => `View all ${total}`,
    showLess: "View fewer",
    filter: "Search by name or identity…",
    noMatches: "None match.",
    confirm: "Import",
    importing: "Importing…",
    cancel: "Cancel",
    replaces: "Replaces this fund's previous composition.",
    summary: (count: number, covered: string): string =>
      `${count} holdings · ${covered}`,
    none: "No composition",
    import: "Import composition",
    onlyEquityFunds: "Equity funds only.",
    notAFund: "This instrument is not an equity fund.",
  },
  instruments: {
    title: "Instruments",
    intro:
      "Your broker does not say what each fund really is: Trade Republic labels both an equity ETF and a physical-gold ETC as FUND. Stocks and crypto resolve on their own from their type. ETCs and bond funds you classify here, once. This classification lives only in your local database and ingestion never overwrites it.",
    unmappedHint: (count: number): string =>
      count === 1
        ? "1 instrument still carries the default value and stays unresolved."
        : `${count} instruments still carry the default value and stay unresolved.`,
    columns: {
      instrument: "Instrument",
      exposure: "Exposure",
      leaf: "Leaf",
      resolvesTo: "Resolves as",
      composition: "Composition",
      ter: "TER %",
      hedged: "Currency",
      thesis: "Thesis",
      held: "Value",
    },
    hedgedShort: "Hedged",
    thesisHint:
      "The thesis says why you hold the instrument, not what it is: that is what the exposure says. It changes when your reasoning changes, so it lives here and not on the trade that bought it.",
    defaultOption: "(default for the type)",
    leafPlaceholder: "XAU, BTC…",
    leafRequired: "This kind needs a leaf (e.g. XAU).",
    terPlaceholder: "0.22",
    terInvalid:
      "The TER goes in annual percent, between 0 and 5. A 0.22% is written 0.22.",
    invalid: "Invalid data.",
    save: "Save",
    saving: "…",
    saved: "Saved",
    closed: "Closed",
    empty: "No instruments. Import your trades with pnpm ingest.",
    sync: {
      action: "Refresh prices",
      loading: "Syncing prices…",
      nothing: "No instrument has a quote symbol yet.",
      done: (updated: number, mapped: number): string =>
        `${updated} of ${mapped} ${mapped === 1 ? "price updated" : "prices updated"}`,
      failed: (count: number): string =>
        count === 1 ? "1 failed" : `${count} failed`,
      staleDetail: (count: number): string =>
        count === 1 ? "1 with a stale quote" : `${count} with stale quotes`,
      noQuoteDetail: (count: number): string =>
        count === 1 ? "1 with no answer" : `${count} with no answer`,
      error: "Prices could not be synced.",
    },
  },
  target: {
    title: "Target",
    intro:
      "Your monthly savings plan. The amounts are the fact and the weight is derived from them. A target is never edited: when the plan changes you store a new version with its effective date, so which target was in force on any given date stays answerable.",
    none: "No target stored yet. Create the first version below or use pnpm target:set.",
    activeFrom: (date: string): string => `In force since ${date}`,
    columns: {
      instrument: "Instrument",
      amount: "Monthly amount",
      weight: "Weight",
    },
    total: "Monthly total",
    notHeld: "Not held yet",
    notImported: "Not imported yet",
    history: {
      title: "Versions",
      active: "In force",
      summary: (lines: number, total: string): string =>
        `${lines} ${lines === 1 ? "line" : "lines"} · ${total} a month`,
      delete: "Delete",
      deleting: "…",
      empty: "No versions.",
    },
    form: {
      title: "New version",
      name: "Name",
      namePlaceholder: "Savings plan",
      activeFrom: "In force from",
      note: "Note",
      notePlaceholder: "Why the plan is changing",
      lines: "Lines",
      linesHint:
        "One per line: the instrument identifier and the monthly amount. You can include an instrument you do not hold yet.",
      linesPlaceholder: "IE00TEST0001 300\nIE00TEST0002 75",
      submit: "Save version",
      saving: "Saving…",
      invalid: "Invalid data.",
      idMismatch: (pairs: string): string =>
        `Nothing was saved. These identifiers do not match the imported ones: ${pairs}. A line joins its instrument by exact identifier, so they would never resolve.`,
      saveFailed: "The version could not be saved.",
    },
  },
  projection: {
    title: "Projection",
    intro:
      "If you keep contributing according to the plan in force, where the portfolio could end up. It is not a forecast: it is a resample of the months your own instruments have already lived through. That is why it answers with a range and not a figure: a single line would pretend to know the future.",
    noTarget:
      "There is no target in force to project. Define your savings plan in Target and come back here.",
    fromTarget: "Simulates your current plan",
    noHistory:
      "No line of your plan has price history, so there is nothing to resample. Map their symbols with pnpm prices:map and download the history with pnpm prices:backfill.",
    noWindow:
      "The lines of your plan share not a single month of history, so there is no common window to resample. Extend the shortest history with pnpm prices:backfill.",
    thinWindow: {
      title: "No figures yet: the window is too short",
      body: (months: number, minimum: number, instrument: string): string =>
        `Your lines share ${months} ${months === 1 ? "month" : "months"} of history and ${minimum} are needed. The window is cut short by ${instrument}, which has the least history.`,
      why: (months: number, years: number): string =>
        `This is not a warning you can skip: resampling ${months} months of one particular stretch of market and compounding them ${years * 12} months forward does not project your portfolio, it extrapolates that stretch. A figure like that reads as a forecast however many notes sit under it, and deciding how much to contribute on top of it would mean deciding on those ${months} months.`,
      fix: (instrument: string): string =>
        `Run pnpm prices:backfill on ${instrument} (it fetches 5 years by default) and come back. As soon as the window reaches the minimum, the screen gives figures.`,
    },
    form: {
      horizon: "Horizon (years)",
      contribution: "Monthly contribution",
      goal: "Goal (optional)",
      goalPlaceholder: "1,000,000",
      submit: "Project",
      detail: "Show more detail",
      detailHint:
        "Adds the quartiles (25th and 75th percentiles) between the three scenarios. It does not simulate again: they are two more reads of the same distribution already computed.",
    },
    bands: {
      title: (years: number): string =>
        years === 1 ? "In 1 year" : `In ${years} years`,
      p10: "Bad scenario",
      p25: "Lower quartile",
      p50: "Central scenario",
      p75: "Upper quartile",
      p90: "Good scenario",
      p10Hint:
        "10th percentile: one in ten simulations ends below this figure.",
      p25Hint:
        "25th percentile: one in four simulations ends below this figure. Between the bad scenario and the central one lies half the risk three figures do not show.",
      p75Hint:
        "75th percentile: only one in four simulations ends above this figure.",
      p50Hint:
        "50th percentile: half the simulations end above and half below. It is the median, not an average.",
      p90Hint:
        "90th percentile: only one in ten simulations ends above this figure. It is estimated from the fewest paths, so it is the one that moves most when the seed changes.",
      real: (amount: string): string => `${amount} in today's euros`,
      noReal:
        "Without CPI data this cannot be expressed in today's euros. Run pnpm ipc:sync.",
    },
    contributed: (amount: string): string =>
      `Of that, ${amount} comes out of your pocket: what you already hold simulated, plus every contribution over the horizon.`,
    method: {
      title: "How this was computed",
      window: (months: number, instrument: string): string =>
        `${months} months of history are resampled, the window every line of the plan shares. It is cut short by ${instrument}, which has the least history: filling in its missing months would mean inventing them.`,
      drift: (annual: string, years: number): string =>
        `That window compounds to ${annual} a year, and that is the drift the resample extrapolates ${years} ${years === 1 ? "year" : "years"} forward. If it looks high for a long horizon, it is: look at that number before the headline.`,
      simulations: (count: number, seed: number): string =>
        `${count} simulations, seed ${seed}: the same data always gives the same result.`,
      tailNoise: (simulations: number, months: number): string =>
        `Of the three figures, the good scenario is the least firm: changing the seed alone moves it about four times as much as the other two. The window is not what limits it, because all three narrow at the same rate as simulations rise. What happens is that a tail is estimated from far fewer paths than the median. More simulations fix it, only it takes more than an order of magnitude over the ${simulations} used here, and that would make every answer to a goal more expensive. It would be reproducibility, not accuracy: what ${months} months of sample limit is the accuracy of all three figures at once, not the firmness of this one.`,
      inflation: (annual: string): string =>
        `The amount in today's euros discounts ${annual} a year, the historical average of the CPI. There is no future CPI, so inflation is assumed to resemble its own past too.`,
      fixedWeights:
        "The plan's weights stay fixed over the whole horizon and contributions arrive at the start of the month.",
      twoPots: (offPlan: string): string =>
        `The off-plan money that reaches the window (${offPlan}) is simulated separately, with its own returns and receiving no contributions, because lending the plan's variance to something else would be inventing its risk. Both pots advance on the same drawn month, so a bad month is bad for the whole portfolio at once.`,
      allOffPlanExcluded:
        "The off-plan pot comes out empty, and not because you hold nothing outside the plan: it is that none of what you hold there reaches the window, so all of it goes unsimulated. It is detailed above, with its amount.",
      noOffPlan:
        "Everything you hold is named by the plan, so there is nothing to simulate separately.",
    },
    excluded: (names: string, coverage: string): string =>
      `No price history, so these are left out of the simulation: ${names}. The remaining weights split 100% between them, so what is projected is ${coverage} of your plan, not the whole plan. Run pnpm prices:backfill before trusting the range.`,
    unsimulated: (names: string, amount: string): string =>
      `${amount} in off-plan positions with less history than the window: ${names}. They are not in the figures above and are not added at the end. Freezing them at 0% for twenty years would be as false a claim as lending them the plan's return. The plan fixing the window is what stops a recent purchase from shrinking it for everything else.`,
    unpriced: (count: number): string =>
      count === 1
        ? "1 position with no usable price is left out of the starting value. A missing price is not a value of zero."
        : `${count} positions with no usable price are left out of the starting value. A missing price is not a value of zero.`,
    goal: {
      title: (amount: string): string => `To reach ${amount}`,
      contribution: (amount: string, years: number): string =>
        `Contributing ${amount} a month, the central scenario reaches the goal in ${years === 1 ? "1 year" : `${years} years`}.`,
      contributionUnreachable:
        "No monthly contribution takes the central scenario there within this horizon. Extend the term or lower the goal.",
      horizon: (amount: string, horizon: string): string =>
        `At ${amount} a month, the central scenario reaches the goal in ${horizon}.`,
      horizonNow:
        "You are already there: your portfolio is worth more than the goal.",
      horizonUnreachable:
        "At that contribution the central scenario does not reach the goal in a century.",
      caveat:
        "Both answers point at the median. The central scenario reaching it does not mean you will: half the simulations end below.",
    },
    horizonLabel: (months: number): string => {
      const years = Math.floor(months / 12);
      const rest = months % 12;
      const y = years === 1 ? "1 year" : `${years} years`;
      const m = rest === 1 ? "1 month" : `${rest} months`;
      if (years === 0) return m;
      if (rest === 0) return y;
      return `${y} and ${m}`;
    },
    hypothesis:
      "It is a simulation, not a promise: nothing is stored and no past return obliges the future.",
  },
  movements: {
    title: "Movements",
    summary: (count: number, net: string): string =>
      `${count} ${count === 1 ? "movement" : "movements"} · ${net} net flow`,
    columns: {
      date: "Date",
      type: "Type",
      instrument: "Instrument",
      quantity: "Units",
      price: "Price",
      costs: "Costs",
      amount: "Amount",
    },
    types: {
      BUY: "Buy",
      SELL: "Sell",
      DIVIDEND: "Dividend",
      DEPOSIT: "Deposit",
      WITHDRAWAL: "Withdrawal",
      INTEREST: "Interest",
    },
    empty: "No movements.",
    emptyScreen: {
      title: "No movements yet",
      body: "Import your trades with the CLI (pnpm ingest) to see the full ledger here.",
    },
    amountHint:
      "The amount is the real cash flow: fees included and withholdings deducted.",
  },
  portfolio: {
    title: "Portfolio",
    summary: (count: number, invested: string): string =>
      `${count} ${count === 1 ? "position" : "positions"} · ${invested} contributed`,
    columns: {
      name: "Instrument",
      type: "Type",
      quantity: "Quantity",
      averageCost: "Average price",
      costBasis: "Contributed",
      marketValue: "Value",
      unrealizedPnL: "Result",
      weight: "Weight",
    },
    detail: {
      isin: "ISIN",
      currency: "Currency",
      assetClass: "Asset class",
      realizedPnL: "Realised result",
      firstTrade: "First purchase",
      lastTrade: "Last trade",
      tradeCount: "Number of trades",
    },
    updatedAt: (relative: string): string => `Updated ${relative}`,
    noPrices: "No prices. Run pnpm prices:sync",
    empty: {
      title: "No positions yet",
      body: "Import your movements with the CLI (pnpm ingest) to start tracking your portfolio.",
    },
    error: {
      title: "Positions could not be loaded",
      body: "Check the data source and try again.",
      retry: "Retry",
      sources: "Data sources",
      lastAttempt: (time: string): string =>
        `Last attempt at ${time} · no change to your portfolio`,
    },
    expandLabel: "View detail",
    sort: {
      by: (column: string): string => `Sort by ${column}`,
      asc: "ascending order",
      desc: "descending order",
    },
  },
  realized: {
    title: "Realized",
    about: "About the realised result",
    views: {
      label: "View",
      sales: "Sales",
      tax: "Tax (Bizkaia)",
    },
    intro:
      "Every closed sale, with the cost it consumed at the moment of selling. Purchase fees are already inside the cost and sale fees are subtracted from the gross.",
    avcoWarning:
      "AVCO calculation (weighted average cost), the same basis as the portfolio. It does not match the FIFO tax basis: on the tax return each sale is matched against the oldest purchases, so the result per trade will be different.",
    salesNoun: (count: number): string => (count === 1 ? "sale ·" : "sales ·"),
    resultNoun: "of result",
    columns: {
      date: "Date",
      name: "Instrument",
      quantity: "Units",
      price: "Price",
      grossAmount: "Gross",
      fees: "Fees",
      costBasis: "Cost",
      realizedPnL: "Result",
      returnPct: "%",
      holdingDays: "Days",
    },
    days: (count: number): string => `${count} d`,
    sales: (count: number): string =>
      `${count} ${count === 1 ? "sale" : "sales"}`,
    total: "Total",
    empty: {
      title: "No sales yet",
      body: "When you sell something, the result of each trade will appear here.",
    },
    fiscal: {
      about: "About the tax basis",
      intro:
        "The same sales, on a FIFO basis instead of AVCO, which is what the Bizkaia foral tax return requires and not what the Sales tab uses. Pure calculation: computeTaxLots and computeNetWithCarryforward, no new figures.",
      yearLabel: "Tax year",
      noYears: "There are no sales recorded in any year yet.",
      summary: {
        netBase: "Taxable savings base",
        quota: "Resulting tax",
        scale: (source: string): string => `Scale applied: ${source}`,
        noScale:
          "No tax scale on file for this year. The tax cannot be computed.",
      },
      net: {
        before: "Own net before the repurchase exclusion",
        after: "Own net after the repurchase exclusion",
        counts: (allowed: number, disallowed: number): string =>
          `${allowed} ${allowed === 1 ? "allowed sale" : "allowed sales"}` +
          (disallowed > 0
            ? `, ${disallowed} ${disallowed === 1 ? "excluded for repurchase" : "excluded for repurchase"}`
            : ""),
      },
      salesTitle: "Sales of the year, FIFO order",
      columns: {
        date: "Date",
        name: "Instrument",
        quantity: "Units",
        grossAmount: "Gross",
        fees: "Fees",
        costBasis: "Cost",
        realizedPnL: "Result",
      },
      disallowedBadge: "Repurchase",
      expand: "View lots",
      collapse: "Hide lots",
      lotsTitle: "FIFO lots consumed",
      lotsColumns: {
        acquiredAt: "Acquired",
        quantity: "Units",
        unitCost: "Unit cost",
      },
      empty: {
        title: "No sales in this year",
        body: "Pick another tax year from the dropdown.",
      },
      carryforwardTitle: "Loss carryforward, last 4 years",
      carryforwardColumns: {
        year: "Year",
        ownNet: "Own net",
        consumedFromCarryforward: "Consumed from carryforward",
        finalNet: "Final net",
        pendingLossRemaining: "Pending loss",
      },
      disallowedReason: (months: number): string =>
        `Repurchase of homogeneous securities within ${months} months of the sale: loss not deductible this year.`,
    },
  },
  opportunity: {
    title: "Opportunity cost",
    headlinePre: "Your portfolio against",
    headlinePost: "with the same purchases, dates and fees",
    about: "About opportunity cost",
    intro: (symbol: string): string =>
      `What would have happened if every purchase had gone into the index (${symbol}) instead of the asset you picked: same dates, same amounts and the same fees on both sides. Whatever is left over or missing is asset selection, not the cost of trading.`,
    taxWarning:
      "The counterfactual never sells, so it is never taxed: the gains your real sales did generate pay tax that is not deducted here. The figure is a reference for how the asset selection went, not a tax-perfect comparison.",
    nominal:
      "Every figure is nominal, not adjusted for inflation: the comparison is between two destinations for the same money, and the CPI affects both alike.",
    stats: {
      real: {
        label: "Real portfolio",
        sub: "Today's value plus what was sold",
      },
      benchmark: {
        label: "Counterfactual",
        sub: "All into the index, never selling",
      },
      difference: { label: "Difference", sub: "Real minus counterfactual" },
      realMwr: { label: "Real MWR", sub: "money-weighted" },
      benchmarkMwr: {
        label: "Counterfactual MWR",
        sub: "same money, another destination",
      },
      mwrDifference: {
        label: "MWR difference",
        sub: "Real minus counterfactual",
      },
      unavailable: "no solution",
    },
    proceeds: (amount: string): string =>
      `The real portfolio includes ${amount} of sales already cashed in: the counterfactual never sells, so leaving them out would gift it every euro you realised.`,
    table: {
      title: "By position",
      note: "Each line compares what that instrument is worth today (plus what you received on selling it) against what that same money would be worth in the index. The lines add up to the total difference.",
      noteTitle: "How to read this table",
      instrument: "Instrument",
      contributed: "Contributed",
      real: "Real",
      benchmark: "Counterfactual",
      difference: "Difference",
    },
    truncated: (
      symbol: string,
      date: string,
      count: number,
      amount: string,
    ): string =>
      `${symbol}'s history starts on ${date}. ${count} ${count === 1 ? "earlier purchase" : "earlier purchases"} (${amount}) buy nothing in the counterfactual, because interpolating a price nobody published would be inventing it, but they still count in the real portfolio: the difference favours it by that much. Extend the history with pnpm prices:backfill.`,
    unpriced: (names: string): string =>
      `No usable price: ${names}. They are excluded from both sides, because counting their cost without their value would invent a loss.`,
    unmapped: (symbol: string): string =>
      `No instrument is mapped to ${symbol}, so there is no index to compare against. Run pnpm prices:map <ISIN> ${symbol}.`,
    noHistory: (symbol: string): string =>
      `${symbol} has no price history in euros. Run pnpm prices:backfill <ISIN> max to download it.`,
    empty: {
      title: "No purchases yet",
      body: "Import your movements so they can be replayed against the index.",
    },
  },
  ter: {
    title: "TER cost",
    about: "About the TER cost",
    intro:
      "What managing your funds costs you a year, and how much that cost adds up to projected forward. You enter the TER yourself on the instruments screen: it comes on no statement, and an instrument without one stays out of the weighted average rather than counting as free.",
    weighted: {
      label: "Weighted TER",
      sub: (coverage: string): string =>
        `Over the ${coverage} of your value with a known TER`,
    },
    annual: { label: "Annual cost", sub: "At today's pace, one year" },
    coverageOf: "of",
    coverageSuffix: "have a TER on file",
    unknown: (names: string): string =>
      `No TER on file: ${names}. They stay out of the weighted average and count as 0% in the projection, so the accumulated cost is a floor, not an estimate. Note it down on the instruments screen.`,
    none: {
      title: "No instrument has a TER",
      body: "Note the TER of your funds on the instruments screen and this screen will start saying something.",
    },
    projected: {
      title: (years: number): string =>
        `Accumulated cost over ${years} ${years === 1 ? "year" : "years"}`,
      note: "A fund's price already comes net of its TER: that is how a fund works. So nothing is subtracted here — the twin that charged no fee is simulated and compared path by path, drawn month by drawn month. The difference is the fee, not sampling noise.",
      noteTitle: "How this cost is computed",
      p10: { label: "Bad scenario", sub: "10th percentile" },
      p50: { label: "Central scenario", sub: "median" },
      p90: { label: "Good scenario", sub: "90th percentile" },
      horizonPre: (years: number): string =>
        `${years} ${years === 1 ? "year" : "years"} contributing`,
      horizonPost: "a month, on top of what you already hold.",
    },
    unavailable: {
      "no-target":
        "With no target in force there is no plan to project, so the accumulated cost cannot be computed. The annual figure above still holds.",
      "no-window":
        "The plan's instruments share not a single month of history, so there is nothing to resample.",
      "thin-window": (months: number, name: string): string =>
        `The common history is ${months} months and 60 are needed. The one setting the limit is ${name}: extend it with pnpm prices:backfill.`,
    },
    table: {
      title: "By position",
      only: "Only instruments with a TER on file",
      instrument: "Instrument",
      value: "Value",
      ter: "TER",
      annualCost: "Annual cost",
      unknown: "No data",
    },
    link: "View TER cost",
  },
  instrument: {
    viewFallback: "Asset",
    units: (n: string): string => `${n} units`,
    value: "Value",
    unrealizedPnL: "Unrealised result",
    kpis: {
      twr: { label: "TWR", sub: "time-weighted" },
      mwr: { label: "MWR / IRR", sub: "money-weighted" },
      totalInvested: { label: "Total contributed", sub: "sum of purchases" },
      buyCount: { label: "Contributions", sub: "purchases made" },
      avgBuyAmount: { label: "Average amount", sub: "per contribution" },
    },
    priceChart: {
      title: "Price and trades",
      price: "Price",
      avgCost: "Average cost",
      buy: "Buy",
      sell: "Sell",
      empty: "No trades recorded.",
      noPrice:
        "No price history yet. It builds up with every pnpm prices:sync.",
    },
    ivvChart: {
      title: "Contributed against value",
      invested: "Contributed",
      value: "Value",
      building: "The value line draws itself as the price history accumulates.",
    },
    movements: {
      title: "Movements for this asset",
    },
    notFound: {
      title: "Instrument not found",
      body: "There is no instrument with that identifier.",
      back: "Back to the portfolio",
    },
  },
  meta: {
    summary: {
      title: "Summary · Quoin",
      description: "Your portfolio's value and how it has moved",
    },
    portfolio: {
      title: "Portfolio · Quoin",
      description: "Your current positions",
    },
    allocation: {
      title: "Allocation · Quoin",
      description: "Look-through exposure",
    },
    movements: {
      title: "Movements · Quoin",
      description: "Your full trade ledger",
    },
    realized: {
      title: "Realized · Quoin",
      description: "The result of your closed sales",
    },
    opportunity: {
      title: "Opportunity cost · Quoin",
      description: "Your real flows, bought in the index",
    },
    ter: {
      title: "TER cost · Quoin",
      description: "What managing your funds costs",
    },
    target: {
      title: "Target · Quoin",
      description: "Monthly savings target",
    },
    projection: {
      title: "Projection · Quoin",
      description: "Where your plan could go",
    },
    instruments: {
      title: "Instruments · Quoin",
      description: "Instrument classification",
    },
    instrument: { title: "Asset detail · Quoin", description: "" },
    settings: {
      title: "Settings · Quoin",
      description: "How Quoin looks on this device",
    },
  },
  a11y: {
    mainNav: "Main",
    breadcrumb: "Breadcrumb",
  },
  labels: {
    thesis: THESIS_LABELS,
    thesisDescription: THESIS_DESCRIPTIONS,
    instrumentType: TYPE_LABELS,
    exposureKind: EXPOSURE_KIND_LABELS,
    exposureKindFallback: "Unclassified",
  },
};
