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

const target = (id: string, activeFrom: string) => ({
  id,
  name: id,
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
    name: "The same ledger key with another amount is a conflict",
    local: local({ instruments: [fund()], ledger: [buy("t-1")] }),
    incoming: incoming({
      instruments: [fund()],
      ledger: [buy("t-1", { grossAmount: "101" })],
    }),
    expected: {
      conflicts: [
        { kind: "ledger", key: "TR_CSV::t-1", fields: ["grossAmount"] },
      ],
    },
  },
  {
    name: "A reward valued from two different price histories is a conflict, not a silent pick",
    local: local({
      instruments: [coin()],
      ledger: [
        buy("R2", {
          source: "KRAKEN_CSV",
          account: "kraken",
          instrumentId: COIN,
          quantity: "0.5",
          price: "2.10",
          grossAmount: "1.05",
          funding: "IN_KIND",
          valuationSource: "yahoo",
        }),
      ],
    }),
    incoming: incoming({
      instruments: [coin()],
      ledger: [
        buy("R2", {
          source: "KRAKEN_CSV",
          account: "kraken",
          instrumentId: COIN,
          quantity: "0.5",
          price: "2.12",
          grossAmount: "1.06",
          funding: "IN_KIND",
          valuationSource: "yahoo",
        }),
      ],
    }),
    expected: {
      conflicts: [
        {
          kind: "ledger",
          key: "KRAKEN_CSV::R2",
          fields: ["price", "grossAmount"],
        },
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
      conflicts: [
        { kind: "ledger", key: "KRAKEN_CSV::S1:sell", fields: ["grossAmount"] },
      ],
      apply: { ledger: { insert: [] } },
      compareApply: true,
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
        { kind: "target-day", day: "2026-11-01", ids: ["v-here", "v-there"] },
      ],
    },
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
        'How two devices\' user states merge, and which exchange files are refused. Shared with the mobile client: both implementations must reproduce every case. Omitted in a case: empty collections, peers [], settings { residence: bizkaia, residenceHlc: null }, schemaVersion 1 and deviceName null on the incoming file, and every optional row column (null; fees and taxWithheld "0", fxSource IDENTITY, funding CASH, hedgedToBase false, thesis CORE). An expected plan compares apply and effects only when it lists no conflicts, unless compareApply is true; apply.peers is compared only when the case lists it.',
      merges,
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
