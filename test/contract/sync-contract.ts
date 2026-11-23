import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Row = Record<string, unknown>;

const A = "dev-a";
const B = "dev-b";
const C = "dev-c";
const T = 1761600000000; // 2025-10-27T21:20:00Z
const MIN = 60_000;
const m = (device: string, ms: number, counter = 0) =>
  `${String(ms).padStart(15, "0")}-${String(counter).padStart(4, "0")}-${device}`;

const FUND = "IE00TEST0001";
const STOCK = "US00TEST0002";
const COIN = "TESTCOIN";
const fund = (extra: Row = {}) => ({
  id: FUND,
  name: "Test World ETF",
  type: "ETF",
  ...extra,
});
const stock = (extra: Row = {}) => ({
  id: STOCK,
  name: "Test Stock",
  type: "STOCK",
  ...extra,
});
const coin = (extra: Row = {}) => ({
  id: COIN,
  name: "Test Coin",
  type: "CRYPTO",
  ...extra,
});

const buy = (externalId: string, extra: Row = {}) => ({
  source: "TR_CSV",
  externalId,
  ts: "2026-01-05T09:00:00.000Z",
  type: "BUY",
  instrumentId: FUND,
  quantity: "1",
  price: "100",
  grossAmount: "100",
  currency: "EUR",
  account: "trade-republic",
  ...extra,
});

const kraken = { source: "KRAKEN_CSV", account: "kraken" };
const reward = (refid: string, price: string, grossAmount: string) =>
  buy(refid, {
    ...kraken,
    instrumentId: COIN,
    quantity: "0.5",
    price,
    grossAmount,
    funding: "IN_KIND",
    valuationSource: "yahoo",
  });
const rewardIncome = (refid: string, grossAmount: string) =>
  buy(`${refid}:income`, {
    ...kraken,
    type: "DIVIDEND",
    instrumentId: COIN,
    quantity: null,
    price: null,
    grossAmount,
    funding: "IN_KIND",
    valuationSource: "yahoo",
  });
const swapLeg = (
  externalId: string,
  linkId: string | null,
  type: "BUY" | "SELL" = "BUY",
) =>
  buy(externalId, {
    ...kraken,
    type,
    instrumentId: type === "SELL" ? COIN : STOCK,
    linkId,
    linkKind: linkId ? "swap" : null,
  });

const target = (id: string, activeFrom: string, name = id) => ({
  id,
  name,
  activeFrom,
  createdAt: "2026-10-01T10:00:00.000Z",
  lines: [{ instrumentId: FUND, monthlyAmount: "300" }],
});

const block = (
  asOf: string,
  asOfInferred: boolean,
  hlc: string | null,
  weights = ["0.6", "0.4"],
) => ({
  instrumentId: FUND,
  asOf,
  asOfInferred,
  hlc,
  rows: [
    {
      identity: "US00TEST0101",
      identityKind: "ISIN",
      name: "Alpha Corp",
      weight: weights[0],
    },
    {
      identity: "BETA.US",
      identityKind: "TICKER",
      name: "Beta Inc",
      weight: weights[1],
    },
  ],
});

const identity = (
  identityValue: string,
  status: string,
  resolvedAt: string,
  extra: Row = {},
) => ({
  identity: identityValue,
  identityKind: "ISIN",
  canonicalId: status === "resolved" ? "TESTFIGI0001" : null,
  exchCode: null,
  status,
  source: "openfigi",
  resolvedAt,
  ...extra,
});

const local = (state: Row = {}) => ({
  deviceId: A,
  peers: [{ deviceId: B, seen: m(B, T) }],
  ...state,
});
const incoming = (state: Row = {}) => ({
  deviceId: B,
  exportHlc: m(B, T + 60 * MIN),
  peers: [{ deviceId: A, seen: m(A, T) }],
  ...state,
});

const everything = {
  instruments: [
    fund({
      quoteSymbol: "TEST.DE",
      quoteSymbolHlc: m(B, T - MIN),
      ter: "0.0022",
      terHlc: m(B, T - MIN),
    }),
  ],
  ledger: [buy("t-1")],
  targets: [target("v1", "2026-11-01")],
  holdings: [block("2026-09-30", false, m(B, T - MIN))],
  identities: [
    identity("US00TEST0101", "resolved", "2026-10-01T10:00:00.000Z"),
  ],
};

const merges = [
  {
    name: "Two identical states: nothing to apply",
    local: local(everything),
    incoming: incoming(everything),
    expected: {
      apply: { peers: [{ deviceId: B, seen: m(B, T + 60 * MIN) }] },
    },
  },
  {
    name: "An empty PC receives everything, and is told to fetch prices and rates",
    local: { deviceId: A },
    incoming: incoming({
      ...everything,
      ledger: [
        buy("t-1"),
        buy("t-2", {
          ts: "2026-02-10T15:00:00.000Z",
          type: "DEPOSIT",
          instrumentId: null,
          quantity: null,
          price: null,
          grossAmount: "500",
          currency: "USD",
          fxSource: "ECB",
          fxDate: "2026-02-10",
          fxRate: "1.0412",
          fxDirection: "QUOTE_PER_BASE",
          account: "kraken",
          source: "KRAKEN_CSV",
        }),
      ],
      tombstones: [
        { entity: "PortfolioTarget", key: "v0", hlc: m(B, T - 2 * MIN) },
      ],
    }),
    expected: {
      apply: {
        ledger: {
          insert: [
            buy("t-2", {
              ts: "2026-02-10T15:00:00.000Z",
              type: "DEPOSIT",
              instrumentId: null,
              quantity: null,
              price: null,
              grossAmount: "500",
              currency: "USD",
              fxSource: "ECB",
              fxDate: "2026-02-10",
              fxRate: "1.0412",
              fxDirection: "QUOTE_PER_BASE",
              account: "kraken",
              source: "KRAKEN_CSV",
            }),
            buy("t-1"),
          ],
        },
        instruments: { insert: everything.instruments },
        targets: { insert: everything.targets },
        tombstones: [
          { entity: "PortfolioTarget", key: "v0", hlc: m(B, T - 2 * MIN) },
        ],
        holdings: everything.holdings,
        identities: everything.identities,
        peers: [{ deviceId: B, seen: m(B, T + 60 * MIN) }],
      },
      effects: [
        { kind: "prices", instrumentId: FUND, symbol: "TEST.DE" },
        { kind: "rates", currency: "USD", since: "2026-02-10T15:00:00.000Z" },
      ],
    },
  },
  {
    name: "The same CSV imported on both sides: no duplicates, whatever the local ids were",
    local: local({
      instruments: [fund()],
      ledger: [buy("t-1"), buy("t-2", { quantity: "2", grossAmount: "200" })],
    }),
    incoming: incoming({
      instruments: [fund()],
      ledger: [buy("t-1"), buy("t-2", { quantity: "2", grossAmount: "200" })],
    }),
    expected: {},
  },
  {
    name: "The same ledger key with another amount is set aside, and the rest applies",
    local: local({ instruments: [fund()], ledger: [buy("t-1")] }),
    incoming: incoming({
      instruments: [fund()],
      ledger: [buy("t-1", { grossAmount: "101" }), buy("t-2")],
    }),
    expected: {
      setAside: [
        { kind: "ledger", key: "TR_CSV::t-1", fields: ["grossAmount"] },
      ],
      apply: { ledger: { insert: [buy("t-2")] } },
    },
  },
  {
    name: "A reward valued from two different price histories sets both its rows aside, not a silent pick",
    local: local({
      instruments: [coin()],
      ledger: [reward("R2", "2.10", "1.05"), rewardIncome("R2", "1.05")],
    }),
    incoming: incoming({
      instruments: [coin()],
      ledger: [reward("R2", "2.12", "1.06"), rewardIncome("R2", "1.06")],
    }),
    expected: {
      setAside: [
        {
          kind: "ledger",
          key: "KRAKEN_CSV::R2",
          fields: ["price", "grossAmount"],
        },
        { kind: "ledger", key: "KRAKEN_CSV::R2:income", fields: ["grossAmount"] },
      ],
    },
  },
  {
    name: "CASH here, IN_KIND there: the entry becomes IN_KIND",
    local: local({ instruments: [fund()], ledger: [buy("t-1")] }),
    incoming: incoming({
      instruments: [fund()],
      ledger: [buy("t-1", { funding: "IN_KIND" })],
    }),
    expected: { apply: { ledger: { markInKind: ["TR_CSV::t-1"] } } },
  },
  {
    name: "IN_KIND here, CASH there: it stays IN_KIND",
    local: local({
      instruments: [fund()],
      ledger: [buy("t-1", { funding: "IN_KIND" })],
    }),
    incoming: incoming({ instruments: [fund()], ledger: [buy("t-1")] }),
    expected: {},
  },
  {
    name: "A complete swap enters with both legs",
    local: local({ instruments: [coin(), stock()] }),
    incoming: incoming({
      instruments: [coin(), stock()],
      ledger: [
        buy("S1:sell", {
          source: "KRAKEN_CSV",
          account: "kraken",
          type: "SELL",
          instrumentId: COIN,
          linkId: "S1",
          linkKind: "swap",
        }),
        buy("S1:buy", {
          source: "KRAKEN_CSV",
          account: "kraken",
          instrumentId: STOCK,
          linkId: "S1",
          linkKind: "swap",
        }),
      ],
    }),
    expected: {
      apply: {
        ledger: {
          insert: [
            buy("S1:buy", {
              source: "KRAKEN_CSV",
              account: "kraken",
              instrumentId: STOCK,
              linkId: "S1",
              linkKind: "swap",
            }),
            buy("S1:sell", {
              source: "KRAKEN_CSV",
              account: "kraken",
              type: "SELL",
              instrumentId: COIN,
              linkId: "S1",
              linkKind: "swap",
            }),
          ],
        },
      },
    },
  },
  {
    name: "A swap whose stored leg conflicts brings neither leg",
    local: local({
      instruments: [coin(), stock()],
      ledger: [
        buy("S1:sell", {
          source: "KRAKEN_CSV",
          account: "kraken",
          type: "SELL",
          instrumentId: COIN,
          linkId: "S1",
          linkKind: "swap",
        }),
      ],
    }),
    incoming: incoming({
      instruments: [coin(), stock()],
      ledger: [
        buy("S1:sell", {
          source: "KRAKEN_CSV",
          account: "kraken",
          type: "SELL",
          instrumentId: COIN,
          grossAmount: "99",
          linkId: "S1",
          linkKind: "swap",
        }),
        buy("S1:buy", {
          source: "KRAKEN_CSV",
          account: "kraken",
          instrumentId: STOCK,
          linkId: "S1",
          linkKind: "swap",
        }),
      ],
    }),
    expected: {
      setAside: [
        { kind: "ledger", key: "KRAKEN_CSV::S1:sell", fields: ["grossAmount"] },
      ],
    },
  },
  {
    name: "A row whose link itself differs sets aside the other rows of the local link too",
    local: local({
      instruments: [coin(), stock()],
      ledger: [swapLeg("S1:sell", "S1", "SELL"), swapLeg("S1:buy", "S1")],
    }),
    incoming: incoming({
      instruments: [coin(), stock()],
      ledger: [
        swapLeg("S1:sell", null, "SELL"),
        swapLeg("S1:buy", "S1"),
        swapLeg("S1:buy-2", "S1"),
      ],
    }),
    expected: {
      setAside: [
        {
          kind: "ledger",
          key: "KRAKEN_CSV::S1:sell",
          fields: ["linkId", "linkKind"],
        },
      ],
    },
  },
  {
    name: "A field changed only there is taken, with its origin's mark",
    local: local({
      instruments: [fund({ ter: "0.0022", terHlc: m(A, T - 10 * MIN) })],
    }),
    incoming: incoming({
      instruments: [fund({ ter: "0.0025", terHlc: m(B, T + 5 * MIN) })],
    }),
    expected: {
      apply: {
        instruments: {
          update: [
            { id: FUND, patch: { ter: "0.0025", terHlc: m(B, T + 5 * MIN) } },
          ],
        },
      },
    },
  },
  {
    name: "A field changed only here is kept",
    local: local({
      instruments: [fund({ ter: "0.0025", terHlc: m(A, T + 5 * MIN) })],
    }),
    incoming: incoming({
      instruments: [fund({ ter: "0.0022", terHlc: m(A, T - 10 * MIN) })],
    }),
    expected: {},
  },
  {
    name: "A field changed on both sides to different values is a conflict",
    local: local({
      instruments: [fund({ ter: "0.0025", terHlc: m(A, T + 5 * MIN) })],
    }),
    incoming: incoming({
      instruments: [fund({ ter: "0.0030", terHlc: m(B, T + 5 * MIN) })],
    }),
    expected: {
      conflicts: [
        {
          kind: "field",
          entity: "instrument",
          key: FUND,
          field: "ter",
          local: "0.0025",
          incoming: "0.0030",
        },
      ],
    },
  },
  {
    name: "A field changed on both sides to the same value is no conflict",
    local: local({
      instruments: [
        fund({ thesis: "CONVICTION", thesisHlc: m(A, T + 5 * MIN) }),
      ],
    }),
    incoming: incoming({
      instruments: [
        fund({ thesis: "CONVICTION", thesisHlc: m(B, T + 7 * MIN) }),
      ],
    }),
    expected: {},
  },
  {
    name: "The exposure pair is one field: a new leaf comes with its kind",
    local: local({
      instruments: [
        fund({
          exposureKind: "COMMODITY",
          exposureLeafId: "XAU",
          exposureHlc: m(A, T - MIN),
        }),
      ],
    }),
    incoming: incoming({
      instruments: [
        fund({
          exposureKind: "COMMODITY",
          exposureLeafId: "XAG",
          exposureHlc: m(B, T + MIN),
        }),
      ],
    }),
    expected: {
      apply: {
        instruments: {
          update: [
            {
              id: FUND,
              patch: {
                exposureKind: "COMMODITY",
                exposureLeafId: "XAG",
                exposureHlc: m(B, T + MIN),
              },
            },
          ],
        },
      },
    },
  },
  {
    name: "A device whose clock runs 10 minutes slow still changes a field after the last sync",
    local: local({
      instruments: [fund({ ter: "0.0022", terHlc: m(A, T - MIN) })],
    }),
    incoming: incoming({
      instruments: [fund({ ter: "0.0025", terHlc: m(B, T, 1) })],
    }),
    expected: {
      apply: {
        instruments: {
          update: [{ id: FUND, patch: { ter: "0.0025", terHlc: m(B, T, 1) } }],
        },
      },
    },
  },
  {
    name: "Echo: a value taken there and changed here since is no conflict",
    local: local({
      instruments: [fund({ ter: "0.0025", terHlc: m(A, T + 5 * MIN) })],
    }),
    incoming: incoming({
      instruments: [fund({ ter: "0.0022", terHlc: m(A, T - 10 * MIN) })],
    }),
    expected: {},
  },
  {
    name: "Transitive: C takes from B a change A made, which C had not seen",
    local: {
      deviceId: C,
      peers: [
        { deviceId: A, seen: m(A, T - 10 * MIN) },
        { deviceId: B, seen: m(B, T - 30 * MIN) },
      ],
      instruments: [fund({ ter: "0.0022", terHlc: m(A, T - 10 * MIN) })],
    },
    incoming: {
      deviceId: B,
      exportHlc: m(B, T + 60 * MIN),
      peers: [
        { deviceId: A, seen: m(A, T + 30 * MIN) },
        { deviceId: C, seen: m(C, T - 30 * MIN) },
      ],
      instruments: [fund({ ter: "0.0025", terHlc: m(A, T + 20 * MIN) })],
    },
    expected: {
      apply: {
        instruments: {
          update: [
            { id: FUND, patch: { ter: "0.0025", terHlc: m(A, T + 20 * MIN) } },
          ],
        },
        peers: [
          { deviceId: A, seen: m(A, T + 30 * MIN) },
          { deviceId: B, seen: m(B, T + 60 * MIN) },
        ],
      },
    },
  },
  {
    name: "Two values with no mark that differ are a conflict: nothing says which side changed",
    local: local({ instruments: [fund({ ter: "0.0022" })] }),
    incoming: incoming({ instruments: [fund({ ter: "0.0025" })] }),
    expected: {
      conflicts: [
        {
          kind: "field",
          entity: "instrument",
          key: FUND,
          field: "ter",
          local: "0.0022",
          incoming: "0.0025",
        },
      ],
    },
  },
  {
    name: "A residence with no mark on either side that differs is a conflict",
    local: local(),
    incoming: incoming({
      settings: { residence: "araba", residenceHlc: null },
    }),
    expected: {
      conflicts: [
        {
          kind: "field",
          entity: "settings",
          key: "settings",
          field: "residence",
          local: "bizkaia",
          incoming: "araba",
        },
      ],
    },
  },
  {
    name: "Ingestion fields keep the local value; a missing asset class is filled in",
    local: local({
      instruments: [fund({ name: "Local Name", assetClass: null })],
    }),
    incoming: incoming({
      instruments: [
        fund({ name: "Other Name", type: "STOCK", assetClass: "FUND" }),
      ],
    }),
    expected: {
      apply: {
        instruments: { update: [{ id: FUND, patch: { assetClass: "FUND" } }] },
      },
    },
  },
  {
    name: "A new quote symbol is taken and its history fetched again",
    local: local({
      instruments: [
        fund({ quoteSymbol: "OLD.DE", quoteSymbolHlc: m(A, T - MIN) }),
      ],
    }),
    incoming: incoming({
      instruments: [
        fund({ quoteSymbol: "NEW.DE", quoteSymbolHlc: m(B, T + MIN) }),
      ],
    }),
    expected: {
      apply: {
        instruments: {
          update: [
            {
              id: FUND,
              patch: { quoteSymbol: "NEW.DE", quoteSymbolHlc: m(B, T + MIN) },
            },
          ],
        },
      },
      effects: [{ kind: "prices", instrumentId: FUND, symbol: "NEW.DE" }],
    },
  },
  {
    name: "A cleared quote symbol is taken, with nothing to fetch",
    local: local({
      instruments: [
        fund({ quoteSymbol: "OLD.DE", quoteSymbolHlc: m(A, T - MIN) }),
      ],
    }),
    incoming: incoming({
      instruments: [fund({ quoteSymbol: null, quoteSymbolHlc: m(B, T + MIN) })],
    }),
    expected: {
      apply: {
        instruments: {
          update: [
            {
              id: FUND,
              patch: { quoteSymbol: null, quoteSymbolHlc: m(B, T + MIN) },
            },
          ],
        },
      },
    },
  },
  {
    name: "A target version deleted there and untouched here is deleted here",
    local: local({ targets: [target("v1", "2026-11-01")] }),
    incoming: incoming({
      tombstones: [
        { entity: "PortfolioTarget", key: "v1", hlc: m(B, T + MIN) },
      ],
    }),
    expected: {
      apply: {
        targets: { delete: ["v1"] },
        tombstones: [
          { entity: "PortfolioTarget", key: "v1", hlc: m(B, T + MIN) },
        ],
      },
    },
  },
  {
    name: "A target version deleted here does not come back",
    local: local({
      tombstones: [
        { entity: "PortfolioTarget", key: "v1", hlc: m(A, T + MIN) },
      ],
    }),
    incoming: incoming({ targets: [target("v1", "2026-11-01")] }),
    expected: {},
  },
  {
    name: "Two new target versions on the same day are a conflict",
    local: local({ targets: [target("v-here", "2026-11-01")] }),
    incoming: incoming({ targets: [target("v-there", "2026-11-01")] }),
    expected: {
      conflicts: [
        {
          kind: "target-day",
          day: "2026-11-01",
          local: "v-here",
          incoming: "v-there",
        },
      ],
    },
  },
  {
    name: "One target version with two contents is a conflict",
    local: local({ targets: [target("v1", "2026-11-01", "Here")] }),
    incoming: incoming({ targets: [target("v1", "2026-11-01", "There")] }),
    expected: { conflicts: [{ kind: "target", id: "v1" }] },
  },
  {
    name: "A composition replaced only there is taken",
    local: local({
      instruments: [fund()],
      holdings: [block("2026-06-30", false, m(A, T - MIN))],
    }),
    incoming: incoming({
      instruments: [fund()],
      holdings: [block("2026-09-30", false, m(B, T + MIN), ["0.55", "0.45"])],
    }),
    expected: {
      apply: {
        holdings: [block("2026-09-30", false, m(B, T + MIN), ["0.55", "0.45"])],
      },
    },
  },
  {
    name: "A composition replaced on both sides from dated files: the later day wins",
    local: local({
      instruments: [fund()],
      holdings: [block("2026-09-30", false, m(A, T + MIN))],
    }),
    incoming: incoming({
      instruments: [fund()],
      holdings: [block("2026-08-31", false, m(B, T + MIN), ["0.55", "0.45"])],
    }),
    expected: {},
  },
  {
    name: "A composition replaced on both sides, one undated, is a conflict",
    local: local({
      instruments: [fund()],
      holdings: [block("2026-10-28", true, m(A, T + MIN))],
    }),
    incoming: incoming({
      instruments: [fund()],
      holdings: [block("2026-09-30", false, m(B, T + MIN), ["0.55", "0.45"])],
    }),
    expected: { conflicts: [{ kind: "holdings", instrumentId: FUND }] },
  },
  {
    name: "The same composition dropped on both sides: a day read from the file beats one inferred",
    local: local({
      instruments: [fund()],
      holdings: [block("2026-10-28", true, m(A, T + MIN))],
    }),
    incoming: incoming({
      instruments: [fund()],
      holdings: [block("2026-09-30", false, m(B, T + MIN))],
    }),
    expected: {
      apply: { holdings: [block("2026-09-30", false, m(B, T + MIN))] },
    },
  },
  {
    name: "A resolved identity is not replaced by a later miss",
    local: local({
      identities: [
        identity("US00TEST0101", "resolved", "2026-09-01T10:00:00.000Z"),
      ],
    }),
    incoming: incoming({
      identities: [
        identity("US00TEST0101", "not-found", "2026-10-01T10:00:00.000Z"),
      ],
    }),
    expected: {},
  },
  {
    name: "A miss is replaced by an earlier resolution",
    local: local({
      identities: [
        identity("US00TEST0101", "ambiguous", "2026-10-01T10:00:00.000Z"),
      ],
    }),
    incoming: incoming({
      identities: [
        identity("US00TEST0101", "resolved", "2026-09-01T10:00:00.000Z"),
      ],
    }),
    expected: {
      apply: {
        identities: [
          identity("US00TEST0101", "resolved", "2026-09-01T10:00:00.000Z"),
        ],
      },
    },
  },
  {
    name: "The same resolution with an exchange code beats one without, whatever the dates",
    local: local({
      identities: [
        identity("US00TEST0101", "resolved", "2026-10-01T10:00:00.000Z"),
      ],
    }),
    incoming: incoming({
      identities: [
        identity("US00TEST0101", "resolved", "2026-09-01T10:00:00.000Z", {
          exchCode: "US",
        }),
      ],
    }),
    expected: {
      apply: {
        identities: [
          identity("US00TEST0101", "resolved", "2026-09-01T10:00:00.000Z", {
            exchCode: "US",
          }),
        ],
      },
    },
  },
  {
    name: "Converted rows and rows near midnight are taken exactly as written",
    local: local({
      instruments: [stock()],
      ledger: [
        buy("t-9", {
          instrumentId: STOCK,
          ts: "2026-03-31T23:30:00.000+01:00",
        }),
      ],
    }),
    incoming: incoming({
      instruments: [stock()],
      ledger: [
        buy("t-9", { instrumentId: STOCK, ts: "2026-03-31T22:30:00.000Z" }),
        buy("t-10", {
          instrumentId: STOCK,
          ts: "2026-12-31T23:30:00.000Z",
          price: "110.50",
          grossAmount: "110.50",
          currency: "USD",
          fxSource: "ECB",
          fxDate: "2026-12-31",
          fxRate: "1.1525",
          fxDirection: "QUOTE_PER_BASE",
          originalAmount: "110.50",
          originalCurrency: "USD",
        }),
      ],
    }),
    expected: {
      apply: {
        ledger: {
          insert: [
            buy("t-10", {
              instrumentId: STOCK,
              ts: "2026-12-31T23:30:00.000Z",
              price: "110.50",
              grossAmount: "110.50",
              currency: "USD",
              fxSource: "ECB",
              fxDate: "2026-12-31",
              fxRate: "1.1525",
              fxDirection: "QUOTE_PER_BASE",
              originalAmount: "110.50",
              originalCurrency: "USD",
            }),
          ],
        },
      },
      effects: [
        { kind: "rates", currency: "USD", since: "2026-12-31T23:30:00.000Z" },
      ],
    },
  },
];

const terHere = fund({ ter: "0.0025", terHlc: m(A, T + 5 * MIN) });
const terThere = fund({ ter: "0.0030", terHlc: m(B, T + 5 * MIN) });
const goldHere = fund({
  exposureKind: "COMMODITY",
  exposureLeafId: "XAU",
  exposureHlc: m(A, T + 5 * MIN),
});
const silverThere = fund({
  exposureKind: "COMMODITY",
  exposureLeafId: "XAG",
  exposureHlc: m(B, T + 5 * MIN),
});
const undatedHere = block("2026-10-28", true, m(A, T + MIN));
const datedThere = block("2026-09-30", false, m(B, T + MIN), ["0.55", "0.45"]);

const resolutions = [
  {
    name: "take: a field conflict adopts the value there, with its origin's mark",
    local: local({ instruments: [terHere] }),
    incoming: incoming({ instruments: [terThere] }),
    resolutions: { [`instrument:${FUND}:ter`]: "take" },
    expected: {
      apply: {
        instruments: {
          update: [
            { id: FUND, patch: { ter: "0.0030", terHlc: m(B, T + 5 * MIN) } },
          ],
        },
      },
    },
  },
  {
    name: "keep: a field conflict keeps the value here and marks it afresh",
    local: local({ instruments: [terHere] }),
    incoming: incoming({ instruments: [terThere] }),
    resolutions: { [`instrument:${FUND}:ter`]: "keep" },
    expected: {
      apply: { restamp: [{ kind: "instrument", id: FUND, field: "ter" }] },
    },
  },
  {
    name: "take: the exposure pair is resolved whole",
    local: local({ instruments: [goldHere] }),
    incoming: incoming({ instruments: [silverThere] }),
    resolutions: { [`instrument:${FUND}:exposure`]: "take" },
    expected: {
      apply: {
        instruments: {
          update: [
            {
              id: FUND,
              patch: {
                exposureKind: "COMMODITY",
                exposureLeafId: "XAG",
                exposureHlc: m(B, T + 5 * MIN),
              },
            },
          ],
        },
      },
    },
  },
  {
    name: "keep: the exposure pair is marked afresh as one field",
    local: local({ instruments: [goldHere] }),
    incoming: incoming({ instruments: [silverThere] }),
    resolutions: { [`instrument:${FUND}:exposure`]: "keep" },
    expected: {
      apply: {
        restamp: [{ kind: "instrument", id: FUND, field: "exposure" }],
      },
    },
  },
  {
    name: "take: the residence there is adopted",
    local: local(),
    incoming: incoming({
      settings: { residence: "araba", residenceHlc: null },
    }),
    resolutions: { "settings:residence": "take" },
    expected: {
      apply: { settings: { residence: "araba", residenceHlc: null } },
    },
  },
  {
    name: "keep: the residence here is marked afresh",
    local: local(),
    incoming: incoming({
      settings: { residence: "araba", residenceHlc: null },
    }),
    resolutions: { "settings:residence": "keep" },
    expected: { apply: { restamp: [{ kind: "settings" }] } },
  },
  {
    name: "take: one target version with two contents is replaced by the one there",
    local: local({ targets: [target("v1", "2026-11-01", "Here")] }),
    incoming: incoming({ targets: [target("v1", "2026-11-01", "There")] }),
    resolutions: { "target:v1": "take" },
    expected: {
      apply: {
        targets: {
          insert: [target("v1", "2026-11-01", "There")],
          delete: ["v1"],
        },
      },
    },
  },
  {
    name: "keep: one target version with two contents is buried and reissued under the tombstone's mark",
    local: local({ targets: [target("v1", "2026-11-01", "Here")] }),
    incoming: incoming({ targets: [target("v1", "2026-11-01", "There")] }),
    resolutions: { "target:v1": "keep" },
    expected: {
      apply: {
        targets: { delete: ["v1"] },
        restamp: [
          {
            kind: "reissue",
            target: { ...target("v1", "2026-11-01", "Here"), note: null },
          },
        ],
      },
    },
  },
  {
    name: "take: two versions on one day keep the one there and bury the one here",
    local: local({ targets: [target("v-here", "2026-11-01")] }),
    incoming: incoming({ targets: [target("v-there", "2026-11-01")] }),
    resolutions: { "target-day:2026-11-01": "take" },
    expected: {
      apply: {
        targets: {
          insert: [target("v-there", "2026-11-01")],
          delete: ["v-here"],
        },
        restamp: [{ kind: "tombstone", key: "v-here" }],
      },
    },
  },
  {
    name: "keep: two versions on one day keep the one here and bury the one there",
    local: local({ targets: [target("v-here", "2026-11-01")] }),
    incoming: incoming({ targets: [target("v-there", "2026-11-01")] }),
    resolutions: { "target-day:2026-11-01": "keep" },
    expected: {
      apply: { restamp: [{ kind: "tombstone", key: "v-there" }] },
    },
  },
  {
    name: "take: a composition conflict adopts the block there",
    local: local({ instruments: [fund()], holdings: [undatedHere] }),
    incoming: incoming({ instruments: [fund()], holdings: [datedThere] }),
    resolutions: { [`holdings:${FUND}`]: "take" },
    expected: { apply: { holdings: [datedThere] } },
  },
  {
    name: "keep: a composition conflict marks the block here afresh",
    local: local({ instruments: [fund()], holdings: [undatedHere] }),
    incoming: incoming({ instruments: [fund()], holdings: [datedThere] }),
    resolutions: { [`holdings:${FUND}`]: "keep" },
    expected: {
      apply: { restamp: [{ kind: "holdings", instrumentId: FUND }] },
    },
  },
  {
    name: "A resolution for one conflict leaves the other open, and nothing applies",
    local: local({ instruments: [terHere] }),
    incoming: incoming({
      instruments: [terThere],
      settings: { residence: "araba", residenceHlc: null },
    }),
    resolutions: { [`instrument:${FUND}:ter`]: "keep" },
    expected: {
      conflicts: [
        {
          kind: "field",
          entity: "settings",
          key: "settings",
          field: "residence",
          local: "bizkaia",
          incoming: "araba",
        },
      ],
    },
  },
  {
    name: "A resolution that matches no conflict is refused",
    local: local({ instruments: [terHere] }),
    incoming: incoming({ instruments: [terThere] }),
    resolutions: {
      [`instrument:${FUND}:ter`]: "keep",
      [`instrument:${FUND}:thesis`]: "take",
    },
    expected: { error: "unknown-resolution" },
  },
  {
    name: "A resolution with no conflict at all is refused",
    local: local({ instruments: [fund()] }),
    incoming: incoming({ instruments: [fund()] }),
    resolutions: { "settings:residence": "keep" },
    expected: { error: "unknown-resolution" },
  },
];

const device = (deviceId: string, other: string, state: Row) => ({
  lastHlc: m(deviceId, T + 5 * MIN),
  state: {
    deviceId,
    peers: [{ deviceId: other, seen: m(other, T) }],
    ...state,
  },
});
const at = (minutes: number) => T + minutes * MIN;

/**
 * Three devices: PC A, PC B and the phone (C), which is the only one that talks
 * to both. They converge when they hold the same values, the same deletions and
 * the same rows set aside. Marks may differ only on a field whose value is the
 * same, on purpose: after a `keep` on the phone, the PC the kept value came from
 * already holds it, so `merge` skips the field and that PC keeps its own older
 * mark. The mark is its own and the others have seen it, so it decides nothing;
 * the second scenario edits that field from each device to show it.
 *
 * A row is set aside only against a peer whose version differs. A and the phone
 * hold the same R2, so A never lists it: it never sees B's version.
 */
const R2_APART = ["KRAKEN_CSV::R2", "KRAKEN_CSV::R2:income"];
const TER = { kind: "instrument", id: FUND, field: "ter" };
const peers = (seen: Record<string, string>) =>
  Object.entries(seen).map(([deviceId, mark]) => ({ deviceId, seen: mark }));
const editTer = (deviceId: string, minutes: number, ter: string) => ({
  edit: deviceId,
  nowMs: at(minutes),
  apply: {
    instruments: { update: [{ id: FUND, patch: { ter } }] },
    restamp: [TER],
  },
});
const terTaken = (ter: string, terHlc: string) => ({
  instruments: { update: [{ id: FUND, patch: { ter, terHlc } }] },
});

const r2Here = [reward("R2", "2.10", "1.05"), rewardIncome("R2", "1.05")];
const r2There = [reward("R2", "2.12", "1.06"), rewardIncome("R2", "1.06")];
const krakenBuy = buy("t-9", { ...kraken, instrumentId: COIN });
const v1Buried = {
  entity: "PortfolioTarget",
  key: "v1",
  hlc: m(B, at(20), 3),
};
const composition = block("2026-09-30", false, m(A, at(1), 1));
const fundCreated = fund({ ter: "0.0025", terHlc: m(A, at(2)) });
const fromA = {
  ter: "0.0035",
  terHlc: m(A, at(21)),
  thesis: "CONVICTION",
  thesisHlc: m(A, at(21), 1),
  hedgedToBase: true,
  hedgedToBaseHlc: m(A, at(21), 2),
};
const fromB = {
  exposureKind: "COMMODITY",
  exposureLeafId: "XAU",
  exposureHlc: m(B, at(20), 2),
  thesis: "TACTICAL",
  thesisHlc: m(B, at(20), 1),
};

const held = (
  deviceId: string,
  seen: Record<string, string>,
  ter: string,
  terHlc: string,
  apartFrom: Record<string, string[]>,
) => ({
  setAside: apartFrom,
  state: {
    deviceId,
    peers: peers(seen),
    ledger: [...(deviceId === B ? r2There : r2Here), krakenBuy, buy("t-1")],
    instruments: [
      fund({
        ...fromB,
        ter,
        terHlc,
        hedgedToBase: true,
        hedgedToBaseHlc: m(A, at(21), 2),
      }),
      coin(),
    ],
    targets: [target("v2", "2026-12-01")],
    tombstones: [v1Buried],
    holdings: [composition],
  },
});
const afterKeep = {
  [A]: held(A, { [B]: m(B, at(37)), [C]: m(C, at(40)) }, "0.0035", m(A, at(21)), {
    [C]: [],
  }),
  [B]: held(B, { [A]: m(A, at(35)), [C]: m(C, at(38)) }, "0.0035", m(C, at(33)), {
    [C]: R2_APART,
  }),
  [C]: held(C, { [A]: m(A, at(39)), [B]: m(B, at(37)) }, "0.0035", m(C, at(33)), {
    [A]: [],
    [B]: R2_APART,
  }),
};
const afterEdits = {
  [A]: held(A, { [B]: m(B, at(63)), [C]: m(C, at(72)) }, "0.0050", m(C, at(70)), {
    [C]: [],
  }),
  [B]: held(B, { [A]: m(A, at(71)), [C]: m(C, at(74)) }, "0.0050", m(C, at(70)), {
    [C]: R2_APART,
  }),
  [C]: held(C, { [A]: m(A, at(71)), [B]: m(B, at(73)) }, "0.0050", m(C, at(70)), {
    [A]: [],
    [B]: R2_APART,
  }),
};

const threeDevices = [
  {
    name: "Three devices: two PCs that only the phone talks to end with the same values, deletions and rows set aside",
    devices: {
      [A]: { lastHlc: null, state: { deviceId: A } },
      [B]: {
        lastHlc: null,
        state: {
          deviceId: B,
          ledger: [...r2There, krakenBuy],
          instruments: [coin()],
        },
      },
      [C]: { lastHlc: null, state: { deviceId: C } },
    },
    steps: [
      {
        edit: A,
        nowMs: at(1),
        apply: {
          ledger: { insert: [...r2Here, buy("t-1")] },
          instruments: { insert: [fund({ ter: "0.0020" }), coin()] },
          targets: {
            insert: [target("v1", "2026-11-01"), target("v2", "2026-12-01")],
          },
          holdings: [block("2026-09-30", false, null)],
          restamp: [TER, { kind: "holdings", instrumentId: FUND }],
        },
      },
      editTer(A, 2, "0.0025"),
      { from: A, to: C, nowMs: at(10), status: "applied" },
      {
        from: C,
        to: A,
        nowMs: at(11),
        status: "up-to-date",
        apply: { peers: peers({ [C]: m(C, at(11)) }) },
      },
      {
        from: B,
        to: C,
        nowMs: at(12),
        status: "applied",
        setAside: R2_APART,
        apply: {
          ledger: { insert: [krakenBuy] },
          peers: peers({ [A]: m(A, at(10)), [B]: m(B, at(12)) }),
        },
      },
      {
        from: C,
        to: B,
        nowMs: at(13),
        status: "applied",
        setAside: R2_APART,
        apply: {
          ledger: { insert: [buy("t-1")] },
          instruments: { insert: [fundCreated] },
          targets: {
            insert: [target("v1", "2026-11-01"), target("v2", "2026-12-01")],
          },
          holdings: [composition],
          peers: peers({ [A]: m(A, at(10)), [C]: m(C, at(13)) }),
        },
      },
      {
        edit: B,
        nowMs: at(20),
        apply: {
          instruments: {
            update: [
              {
                id: FUND,
                patch: {
                  ter: "0.0030",
                  thesis: "TACTICAL",
                  exposureKind: "COMMODITY",
                  exposureLeafId: "XAU",
                },
              },
            ],
          },
          targets: { delete: ["v1"] },
          restamp: [
            TER,
            { kind: "instrument", id: FUND, field: "thesis" },
            { kind: "instrument", id: FUND, field: "exposure" },
            { kind: "tombstone", key: "v1" },
          ],
        },
      },
      {
        edit: A,
        nowMs: at(21),
        apply: {
          instruments: {
            update: [
              {
                id: FUND,
                patch: {
                  ter: "0.0035",
                  thesis: "CONVICTION",
                  hedgedToBase: true,
                },
              },
            ],
          },
          restamp: [
            TER,
            { kind: "instrument", id: FUND, field: "thesis" },
            { kind: "instrument", id: FUND, field: "hedgedToBase" },
          ],
        },
      },
      {
        from: A,
        to: C,
        nowMs: at(30),
        status: "applied",
        apply: {
          instruments: { update: [{ id: FUND, patch: fromA }] },
          peers: peers({ [A]: m(A, at(30)), [B]: m(B, at(12)) }),
        },
      },
      {
        from: C,
        to: A,
        nowMs: at(31),
        status: "applied",
        apply: {
          ledger: { insert: [krakenBuy] },
          peers: peers({ [B]: m(B, at(12)), [C]: m(C, at(31)) }),
        },
      },
      {
        from: B,
        to: C,
        nowMs: at(32),
        status: "conflicts",
        conflicts: [`instrument:${FUND}:ter`, `instrument:${FUND}:thesis`],
        setAside: R2_APART,
      },
      {
        from: B,
        to: C,
        nowMs: at(33),
        resolutions: {
          [`instrument:${FUND}:ter`]: "keep",
          [`instrument:${FUND}:thesis`]: "take",
        },
        status: "applied",
        setAside: R2_APART,
        apply: {
          instruments: { update: [{ id: FUND, patch: fromB }] },
          targets: { delete: ["v1"] },
          tombstones: [v1Buried],
          restamp: [TER],
          peers: peers({ [A]: m(A, at(30)), [B]: m(B, at(33)) }),
        },
      },
      {
        from: C,
        to: B,
        nowMs: at(34),
        status: "applied",
        setAside: R2_APART,
        apply: {
          instruments: {
            update: [
              {
                id: FUND,
                patch: {
                  ter: "0.0035",
                  terHlc: m(C, at(33)),
                  hedgedToBase: true,
                  hedgedToBaseHlc: m(A, at(21), 2),
                },
              },
            ],
          },
          peers: peers({ [A]: m(A, at(30)), [C]: m(C, at(34)) }),
        },
      },
      {
        from: A,
        to: C,
        nowMs: at(35),
        status: "up-to-date",
        apply: { peers: peers({ [A]: m(A, at(35)), [B]: m(B, at(33)) }) },
      },
      {
        from: C,
        to: A,
        nowMs: at(36),
        status: "applied",
        apply: {
          instruments: { update: [{ id: FUND, patch: fromB }] },
          targets: { delete: ["v1"] },
          tombstones: [v1Buried],
          peers: peers({ [B]: m(B, at(33)), [C]: m(C, at(36)) }),
        },
      },
      {
        from: B,
        to: C,
        nowMs: at(37),
        status: "up-to-date",
        setAside: R2_APART,
        apply: { peers: peers({ [A]: m(A, at(35)), [B]: m(B, at(37)) }) },
      },
      {
        from: C,
        to: B,
        nowMs: at(38),
        status: "up-to-date",
        setAside: R2_APART,
        apply: { peers: peers({ [A]: m(A, at(35)), [C]: m(C, at(38)) }) },
      },
      {
        from: A,
        to: C,
        nowMs: at(39),
        status: "up-to-date",
        apply: { peers: peers({ [A]: m(A, at(39)), [B]: m(B, at(37)) }) },
      },
      {
        from: C,
        to: A,
        nowMs: at(40),
        status: "up-to-date",
        apply: { peers: peers({ [B]: m(B, at(37)), [C]: m(C, at(40)) }) },
      },
    ],
    end: afterKeep,
  },
  {
    name: "Three devices, afterwards: the field whose mark differs on A is edited on B, on A and on the phone, and each edit reaches the other two with no conflict",
    devices: {
      [A]: { lastHlc: m(A, at(39)), state: afterKeep[A].state },
      [B]: { lastHlc: m(B, at(37)), state: afterKeep[B].state },
      [C]: { lastHlc: m(C, at(40)), state: afterKeep[C].state },
    },
    steps: [
      editTer(B, 50, "0.0040"),
      {
        from: B,
        to: C,
        nowMs: at(51),
        status: "applied",
        setAside: R2_APART,
        apply: terTaken("0.0040", m(B, at(50))),
      },
      {
        from: C,
        to: B,
        nowMs: at(52),
        status: "up-to-date",
        setAside: R2_APART,
      },
      { from: A, to: C, nowMs: at(53), status: "up-to-date" },
      {
        from: C,
        to: A,
        nowMs: at(54),
        status: "applied",
        apply: terTaken("0.0040", m(B, at(50))),
      },
      editTer(A, 60, "0.0045"),
      {
        from: A,
        to: C,
        nowMs: at(61),
        status: "applied",
        apply: terTaken("0.0045", m(A, at(60))),
      },
      { from: C, to: A, nowMs: at(62), status: "up-to-date" },
      {
        from: B,
        to: C,
        nowMs: at(63),
        status: "up-to-date",
        setAside: R2_APART,
      },
      {
        from: C,
        to: B,
        nowMs: at(64),
        status: "applied",
        setAside: R2_APART,
        apply: terTaken("0.0045", m(A, at(60))),
      },
      editTer(C, 70, "0.0050"),
      { from: A, to: C, nowMs: at(71), status: "up-to-date" },
      {
        from: C,
        to: A,
        nowMs: at(72),
        status: "applied",
        apply: terTaken("0.0050", m(C, at(70))),
      },
      {
        from: B,
        to: C,
        nowMs: at(73),
        status: "up-to-date",
        setAside: R2_APART,
      },
      {
        from: C,
        to: B,
        nowMs: at(74),
        status: "applied",
        setAside: R2_APART,
        apply: terTaken("0.0050", m(C, at(70))),
      },
    ],
    end: afterEdits,
  },
];

const scenarios = [
  {
    name: "A field resolved once stays resolved: the next syncs both ways are up to date",
    devices: {
      [A]: device(A, B, { instruments: [terHere] }),
      [B]: device(B, A, { instruments: [terThere] }),
    },
    steps: [
      {
        from: B,
        to: A,
        nowMs: at(10),
        status: "conflicts",
        conflicts: [`instrument:${FUND}:ter`],
      },
      {
        from: B,
        to: A,
        nowMs: at(11),
        resolutions: { [`instrument:${FUND}:ter`]: "keep" },
        status: "applied",
      },
      { from: A, to: B, nowMs: at(12), status: "applied" },
      { from: B, to: A, nowMs: at(13), status: "up-to-date" },
      { from: A, to: B, nowMs: at(14), status: "up-to-date" },
    ],
    converged: true,
  },
  {
    name: "Every kind of conflict resolved together converges",
    devices: {
      [A]: device(A, B, {
        instruments: [terHere],
        targets: [
          target("v1", "2026-11-01", "Here"),
          target("v-here", "2026-12-01"),
        ],
        holdings: [undatedHere],
      }),
      [B]: device(B, A, {
        instruments: [terThere],
        targets: [
          target("v1", "2026-11-01", "There"),
          target("v-there", "2026-12-01"),
        ],
        holdings: [datedThere],
        settings: { residence: "araba", residenceHlc: null },
      }),
    },
    steps: [
      {
        from: B,
        to: A,
        nowMs: at(10),
        resolutions: {
          [`instrument:${FUND}:ter`]: "take",
          "settings:residence": "keep",
          "target:v1": "keep",
          "target-day:2026-12-01": "take",
          [`holdings:${FUND}`]: "keep",
        },
        status: "applied",
      },
      { from: A, to: B, nowMs: at(11), status: "applied" },
      { from: B, to: A, nowMs: at(12), status: "up-to-date" },
      { from: A, to: B, nowMs: at(13), status: "up-to-date" },
    ],
    converged: true,
  },
  {
    name: "A ledger row set aside stays apart on each side, sync after sync, while the rest converges",
    devices: {
      [A]: device(A, B, {
        instruments: [coin()],
        ledger: [reward("R2", "2.10", "1.05"), rewardIncome("R2", "1.05")],
      }),
      [B]: device(B, A, {
        instruments: [coin()],
        ledger: [
          reward("R2", "2.12", "1.06"),
          rewardIncome("R2", "1.06"),
          buy("t-1", { ...kraken, instrumentId: COIN }),
        ],
      }),
    },
    steps: [
      {
        from: B,
        to: A,
        nowMs: at(10),
        status: "applied",
        setAside: ["KRAKEN_CSV::R2", "KRAKEN_CSV::R2:income"],
      },
      {
        from: A,
        to: B,
        nowMs: at(11),
        status: "up-to-date",
        setAside: ["KRAKEN_CSV::R2", "KRAKEN_CSV::R2:income"],
      },
      {
        from: B,
        to: A,
        nowMs: at(12),
        status: "up-to-date",
        setAside: ["KRAKEN_CSV::R2", "KRAKEN_CSV::R2:income"],
      },
    ],
    converged: false,
  },
];

const valid = {
  schemaVersion: 1,
  deviceId: B,
  exportHlc: m(B, T),
  settings: { residence: "bizkaia", residenceHlc: null },
};
const refusals = [
  {
    name: "A schemaVersion this version does not read",
    file: { ...valid, schemaVersion: 2 },
    error: "unsupported-schema-version",
  },
  {
    name: "A file with no schemaVersion",
    file: { deviceId: B },
    error: "unsupported-schema-version",
  },
  {
    name: "A file exported by this same database",
    file: { ...valid, deviceId: A, exportHlc: m(A, T) },
    localDeviceId: A,
    error: "same-device",
  },
  {
    name: "An export mark of another device",
    file: { ...valid, exportHlc: m(C, T) },
    error: "invalid",
  },
  {
    name: "A linked operation with one leg",
    file: {
      ...valid,
      instruments: [coin()],
      ledger: [
        buy("S1:sell", {
          source: "KRAKEN_CSV",
          account: "kraken",
          type: "SELL",
          instrumentId: COIN,
          linkId: "S1",
          linkKind: "swap",
        }),
      ],
    },
    error: "invalid",
  },
  {
    name: "Holdings of an instrument the file does not carry",
    file: { ...valid, holdings: [block("2026-09-30", false, null)] },
    error: "invalid",
  },
];

export const SYNC_CONTRACT_FILE = fileURLToPath(
  new URL("./sync.json", import.meta.url),
);

export function syncContractJson(): string {
  return `${JSON.stringify(
    {
      contract: "sync",
      version: 1,
      description:
        'How two devices\' user states merge, and which exchange files are refused. Shared with the mobile client: both implementations must reproduce every case. Omitted in a case: empty collections, peers [], settings { residence: bizkaia, residenceHlc: null }, schemaVersion 1 and deviceName null on the incoming file, and every optional row column (null; fees and taxWithheld "0", fxSource IDENTITY, funding CASH, hedgedToBase false, thesis CORE). A merge may carry resolutions, keyed by conflictKey; an expected error means merge throws. An expected plan compares apply and effects only when it lists no conflicts, unless compareApply is true; apply.peers is compared only when the case lists it; setAside is always compared. A scenario replays syncs between devices: each step exports `from` at nowMs (exportDevice), merges it into `to` with the step\'s resolutions, and then: with conflicts nothing changes; with no data to change (changesData false) only the peers are written and the status is up-to-date; otherwise applyPlan at nowMs. converged: the two user states (all but deviceId and peers) end equal. A scenario may hold more than two devices and three optional keys. A step { edit, nowMs, apply } is a change made on that device: applyPlan of that plan at nowMs with the device\'s peers left as they are, so a value in a patch gets its mark from a restamp. A sync step may carry apply, the plan merge must return, compared like a merge\'s expected.apply (whole, and peers only when listed). end gives, per device, its whole final state, peers included, and setAside: per peer it merged from, the ledger keys set aside in the last merge from that peer; a scenario with end states no converged. Devices that converge hold the same values, deletions and rows set aside; a mark may differ only on a field whose value is the same (after a keep, the device the kept value came from keeps its own older mark, which decides nothing). A row is set aside only against a peer whose version differs, so a device whose only peer holds its own version never lists it.',
      merges: [...merges, ...resolutions],
      scenarios: [...scenarios, ...threeDevices],
      refusals,
    },
    null,
    2,
  )}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SYNC_CONTRACT_FILE, syncContractJson());
}
