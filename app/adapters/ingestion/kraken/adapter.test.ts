import { describe, it, expect, beforeEach } from "vitest";

import type {
  ExposureKind,
  Instrument,
  LedgerEvent,
  Thesis,
} from "~/core/domain";
import type {
  InstrumentRepository,
  LedgerEventFilter,
  LedgerRepository,
  DailyWriteCount,
  PriceRepository,
  PriceSnapshot,
} from "~/core/ports";

import { rateBookFrom } from "~/core/fx";
import { tradeAmounts } from "~/core/swap";

import { AFFECTS_POSITION, DISCARD_REASONS } from "../discard";
import { KrakenCsvAdapter } from "./adapter";
import { KrakenBalanceMismatchError } from "./balance";
import { krakenCsv, type KrakenFixtureRow } from "./csv-fixture";

class FakeInstrumentRepository implements InstrumentRepository {
  upserted: Instrument[] = [];
  async upsert(instruments: readonly Instrument[]): Promise<void> {
    this.upserted.push(...instruments);
  }
  async list(): Promise<Instrument[]> {
    return this.upserted;
  }
  async get(id: string): Promise<Instrument | null> {
    return this.upserted.find((i) => i.id === id) ?? null;
  }
  async setQuoteSymbol(id: string, symbol: string | null): Promise<void> {
    const instrument = this.upserted.find((i) => i.id === id);
    if (instrument) instrument.quoteSymbol = symbol;
  }
  async setTer(id: string, ter: string | null): Promise<void> {
    const instrument = this.upserted.find((i) => i.id === id);
    if (instrument) instrument.ter = ter;
  }
  async setHedgedToBase(id: string, hedged: boolean): Promise<void> {
    const instrument = this.upserted.find((i) => i.id === id);
    if (instrument) instrument.hedgedToBase = hedged;
  }

  async setThesis(id: string, thesis: Thesis): Promise<void> {
    const instrument = this.upserted.find((i) => i.id === id);
    if (instrument) instrument.thesis = thesis;
  }
  async setExposure(
    id: string,
    kind: ExposureKind | null,
    leafId: string | null,
  ): Promise<void> {
    const instrument = this.upserted.find((i) => i.id === id);
    if (instrument) {
      instrument.exposureKind = kind;
      instrument.exposureLeafId = leafId;
    }
  }
}

class FakeLedgerRepository implements LedgerRepository {
  appended: LedgerEvent[] = [];
  async existing(): Promise<Set<string>> {
    return new Set();
  }
  async append(events: readonly LedgerEvent[]) {
    this.appended.push(...events);
    return { inserted: events.length, skipped: 0 };
  }
  async list(_filter?: LedgerEventFilter): Promise<LedgerEvent[]> {
    return this.appended;
  }
  async markInKind(): Promise<number> {
    return 0;
  }
}

class FakePriceRepository implements PriceRepository {
  constructor(private readonly snapshots: PriceSnapshot[] = []) {}
  async saveMany(): Promise<number> {
    return 0;
  }
  async latest(): Promise<Map<string, PriceSnapshot>> {
    return new Map();
  }
  async replaceHistory(): Promise<number> {
    return 0;
  }
  async saveDaily(): Promise<DailyWriteCount> {
    return { inserted: 0, corrected: 0, live: false };
  }
  async lastAsOf(): Promise<Date | null> {
    return null;
  }
  async historyFor(instrumentId: string): Promise<PriceSnapshot[]> {
    return this.snapshots.filter((s) => s.instrumentId === instrumentId);
  }
}

const CSV = krakenCsv([
  {
    refid: "T1",
    time: "2025-11-13 18:04:48",
    type: "spend",
    subclass: "fiat",
    asset: "EUR",
    amount: "-150.0000",
  },
  {
    refid: "T1",
    time: "2025-11-13 18:04:48",
    type: "receive",
    subclass: "crypto",
    asset: "BTC",
    amount: "0.0030000000",
  },
  {
    refid: "D1",
    time: "2025-11-17 13:38:00",
    type: "deposit",
    subclass: "fiat",
    asset: "EUR",
    amount: "500.0000",
  },
  {
    refid: "RW1",
    time: "2025-11-25 23:25:20",
    type: "reward",
    subtype: "welcomebonus",
    subclass: "crypto",
    asset: "BTC",
    amount: "0.0000057100",
  },
  {
    refid: "RW2",
    time: "2025-11-14 00:06:13",
    type: "reward",
    subtype: "welcomebonus",
    subclass: "crypto",
    asset: "SOL",
    amount: "0.0017288700",
  },
  {
    refid: "S1",
    time: "2025-11-20 11:55:11",
    type: "spend",
    subclass: "crypto",
    asset: "PEPE",
    amount: "-629732.00",
  },
  {
    refid: "S1",
    time: "2025-11-20 11:55:11",
    type: "receive",
    subclass: "crypto",
    asset: "SOL",
    amount: "0.0208900000",
  },
]);

describe("KrakenCsvAdapter", () => {
  let instruments: FakeInstrumentRepository;
  let ledger: FakeLedgerRepository;
  let adapter: KrakenCsvAdapter;

  const btcAt = (asOf: string, price: string): PriceSnapshot => ({
    instrumentId: "BTC",
    price,
    currency: "EUR",
    asOf: new Date(asOf),
    source: "YAHOO",
  });

  beforeEach(() => {
    instruments = new FakeInstrumentRepository();
    ledger = new FakeLedgerRepository();
    adapter = new KrakenCsvAdapter(
      instruments,
      ledger,
      new FakePriceRepository([btcAt("2025-11-24T00:00:00Z", "80000")]),
    );
  });

  it("imports crypto activity and EUR cash, setting aside swaps and rewards with no price", async () => {
    const summary = await adapter.import(CSV);

    expect(summary.total).toBe(5);
    expect(summary.imported).toBe(3);
    expect(summary.discarded).toEqual({
      "reward-unpriced": 1,
      "swap-unpriced": 1,
    });
    expect(summary.instruments).toBe(3);
    expect(instruments.upserted.map((i) => i.id).sort()).toEqual([
      "BTC",
      "PEPE",
      "SOL",
    ]);
    expect(ledger.appended).toHaveLength(4);
  });

  it("gives the imported reward the market value it had that day", async () => {
    await adapter.import(CSV);

    const reward = ledger.appended.find((e) => e.note === "kraken-reward");
    expect(reward?.type).toBe("BUY");
    if (reward?.type === "BUY") {
      expect(reward.price).toBe("80000");
      expect(reward.grossAmount).toBe("0.4568");
    }
  });

  it("also records the reward as income at the same market value", async () => {
    await adapter.import(CSV);

    const income = ledger.appended.find(
      (e) => e.note === "kraken-reward-income",
    );
    expect(income?.type).toBe("DIVIDEND");
    if (income?.type === "DIVIDEND") {
      expect(income.instrumentId).toBe("BTC");
      expect(income.grossAmount).toBe("0.4568");
      expect(income.externalId).toBe("RW1:income");
    }
  });

  it("discards the reward when no price is available for it", async () => {
    const blind = new KrakenCsvAdapter(instruments, ledger);

    const summary = await blind.import(CSV);

    expect(summary.discarded).toEqual({
      "reward-unpriced": 2,
      "swap-unpriced": 1,
    });
    expect(summary.imported).toBe(2);
  });
});

describe("KrakenCsvAdapter in another fiat currency", () => {
  const USD_CSV = krakenCsv([
    {
      refid: "U1",
      time: "2026-01-05 10:00:00",
      type: "deposit",
      subclass: "fiat",
      asset: "USD",
      amount: "500.0000",
    },
    {
      refid: "B1",
      time: "2026-01-06 10:00:00",
      type: "spend",
      subclass: "fiat",
      asset: "USD",
      amount: "-100.0000",
      fee: "0.4",
    },
    {
      refid: "B1",
      time: "2026-01-06 10:00:00",
      type: "receive",
      subclass: "crypto",
      asset: "BTC",
      amount: "0.0010000000",
    },
    {
      refid: "R1",
      time: "2026-01-07 05:52:00",
      type: "reward",
      subclass: "crypto",
      asset: "BTC",
      amount: "0.0000010000",
    },
  ]);

  const usdBtc = (day: string, price: string): PriceSnapshot => ({
    instrumentId: "BTC",
    price,
    currency: "USD",
    asOf: new Date(`${day}T00:00:00Z`),
    source: "YAHOO",
  });

  const book = rateBookFrom(
    ["2026-01-05", "2026-01-06", "2026-01-07"].map((day) => ({
      source: "ECB",
      base: "EUR",
      quote: "USD",
      day,
      rate: "1.1",
    })),
  );

  it("converts the deposit, the purchase and a reward priced in dollars at the ECB rate of each day", async () => {
    const ledger = new FakeLedgerRepository();
    const asked: string[][] = [];
    const adapter = new KrakenCsvAdapter(
      new FakeInstrumentRepository(),
      ledger,
      new FakePriceRepository([usdBtc("2026-01-06", "99000")]),
      async (currencies) => {
        asked.push([...currencies]);
        return book;
      },
    );

    const summary = await adapter.import(USD_CSV);

    expect(asked).toEqual([["USD"]]);
    expect(summary.discarded).toEqual({});
    expect(
      ledger.appended.map((e) => [e.type, e.currency, e.fxSource, e.fxDate]),
    ).toEqual([
      ["DEPOSIT", "USD", "ECB", "2026-01-05"],
      ["BUY", "USD", "ECB", "2026-01-06"],
      ["BUY", "USD", "ECB", "2026-01-07"],
      ["DIVIDEND", "USD", "ECB", "2026-01-07"],
    ]);
  });

  it("sets aside as fx-unavailable what has no rate for its day, and says which days it needs", async () => {
    const adapter = new KrakenCsvAdapter(
      new FakeInstrumentRepository(),
      new FakeLedgerRepository(),
      new FakePriceRepository([]),
      async () => rateBookFrom([]),
    );

    const batch = await adapter.plan(USD_CSV);

    expect(batch.discarded).toEqual({
      "fx-unavailable": 2,
      "reward-unpriced": 1,
    });
    expect(batch.ratesNeeded).toEqual(new Map([["USD", "2026-01-05"]]));
  });
});

describe("KrakenCsvAdapter discards", () => {
  const MIXED = krakenCsv([
    {
      refid: "B1",
      time: "2026-01-05 10:00:00",
      type: "spend",
      subclass: "fiat",
      asset: "EUR",
      amount: "-100.0000",
    },
    {
      refid: "B1",
      time: "2026-01-05 10:00:00",
      type: "receive",
      subclass: "crypto",
      asset: "BTC",
      amount: "0.0010000000",
    },
    {
      refid: "E1",
      time: "2026-01-11 05:52:10",
      type: "earn",
      subtype: "reward",
      subclass: "crypto",
      asset: "SOL",
      wallet: "earn / flexible",
      amount: "0.0004000000",
    },
    {
      refid: "E2",
      time: "2026-01-12 05:52:40",
      type: "reward",
      subtype: "welcomebonus",
      subclass: "crypto",
      asset: "ETH",
      amount: "0.0002000000",
    },
    {
      refid: "D1",
      time: "2026-02-01 09:00:00",
      type: "deposit",
      subclass: "crypto",
      asset: "BTC",
      amount: "0.0050000000",
    },
    {
      refid: "W1",
      time: "2026-02-03 09:00:00",
      type: "withdrawal",
      subclass: "crypto",
      asset: "BTC",
      amount: "-0.0020000000",
      fee: "0.00001",
    },
    {
      refid: "D2",
      time: "2026-02-04 09:00:00",
      type: "deposit",
      subclass: "crypto",
      asset: "ETH",
      amount: "0.1000000000",
    },
    {
      refid: "S1",
      time: "2026-02-10 12:00:00",
      type: "spend",
      subclass: "crypto",
      asset: "ETH",
      amount: "-0.0500000000",
    },
    {
      refid: "S1",
      time: "2026-02-10 12:00:00",
      type: "receive",
      subclass: "crypto",
      asset: "BTC",
      amount: "0.0015000000",
      fee: "0.000003",
    },
    {
      refid: "S2",
      time: "2026-02-11 12:00:00",
      type: "spend",
      subclass: "crypto",
      asset: "BTC",
      amount: "-0.0010000000",
    },
    {
      refid: "S2",
      time: "2026-02-11 12:00:00",
      type: "receive",
      subclass: "crypto",
      asset: "SOL",
      amount: "0.4000000000",
      fee: "0.001",
    },
    {
      refid: "T1",
      time: "2026-02-12 12:00:00",
      type: "spend",
      subclass: "fiat",
      asset: "EUR",
      amount: "-50.0000",
    },
    {
      refid: "T1",
      time: "2026-02-12 12:00:00",
      type: "receive",
      subclass: "crypto",
      asset: "ETH",
      amount: "0.0200000000",
    },
    {
      refid: "R1",
      time: "2026-03-01 05:52:00",
      type: "reward",
      subclass: "crypto",
      asset: "BTC",
      amount: "0.0000010000",
    },
  ]);

  const detail = (
    date: string,
    type: string,
    subtype: string | null,
    instrument: string,
  ) => ({ date, type, subtype, instrument });

  it("sorts every set-aside group into a reason by what it does to the position", async () => {
    const adapter = new KrakenCsvAdapter(
      new FakeInstrumentRepository(),
      new FakeLedgerRepository(),
      new FakePriceRepository([]),
    );

    const summary = await adapter.import(MIXED);

    expect(summary.imported).toBe(2);
    expect(summary.discarded).toEqual({
      "reward-unpriced": 3,
      "crypto-transfer": 3,
      "swap-unpriced": 2,
    });
    expect(summary.discardedDetails).toEqual({
      "reward-unpriced": [
        detail("2026-01-11T05:52:10.000Z", "earn", "reward", "SOL"),
        detail("2026-01-12T05:52:40.000Z", "reward", "welcomebonus", "ETH"),
        detail("2026-03-01T05:52:00.000Z", "reward", null, "BTC"),
      ],
      "crypto-transfer": [
        detail("2026-02-01T09:00:00.000Z", "deposit", null, "BTC"),
        detail("2026-02-03T09:00:00.000Z", "withdrawal", null, "BTC"),
        detail("2026-02-04T09:00:00.000Z", "deposit", null, "ETH"),
      ],
      "swap-unpriced": [
        {
          ...detail("2026-02-10T12:00:00.000Z", "receive", null, "ETH → BTC"),
          unpriced: ["ETH", "BTC"],
        },
        {
          ...detail("2026-02-11T12:00:00.000Z", "receive", null, "BTC → SOL"),
          unpriced: ["BTC", "SOL"],
        },
      ],
    });
  });

  it("flags exactly the reasons that leave a modelled position wrong", () => {
    expect(
      DISCARD_REASONS.filter((reason) => AFFECTS_POSITION[reason]),
    ).toEqual([
      "swap-unpriced",
      "crypto-transfer",
      "reward-unpriced",
      "fx-unavailable",
      "invalid-crypto-code",
    ]);
  });
});

describe("KrakenCsvAdapter and the balance column", () => {
  it("refuses the whole file when a balance does not follow, naming where", async () => {
    const ledger = new FakeLedgerRepository();
    const instruments = new FakeInstrumentRepository();
    const csv = krakenCsv([
      {
        refid: "D1",
        time: "2026-01-05 10:00:00",
        type: "deposit",
        subclass: "fiat",
        asset: "EUR",
        amount: "500",
      },
      {
        refid: "B1",
        time: "2026-01-06 10:00:00",
        type: "spend",
        subclass: "fiat",
        asset: "EUR",
        amount: "-100",
        fee: "1",
        balance: "400",
      },
      {
        refid: "B1",
        time: "2026-01-06 10:00:00",
        type: "receive",
        subclass: "crypto",
        asset: "BTC",
        amount: "0.001",
      },
    ]);

    const plan = new KrakenCsvAdapter(instruments, ledger).import(csv);

    await expect(plan).rejects.toBeInstanceOf(KrakenBalanceMismatchError);
    await expect(plan).rejects.toMatchObject({
      asset: "EUR",
      wallet: "spot / main",
      date: "2026-01-06 10:00:00 UTC",
    });
    expect(ledger.appended).toEqual([]);
    expect(instruments.upserted).toEqual([]);
  });
});

describe("KrakenCsvAdapter over the shapes of a real export", () => {
  const usd = rateBookFrom(
    ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"].map((day) => ({
      source: "ECB",
      base: "EUR",
      quote: "USD",
      day,
      rate: "1.25",
    })),
  );
  const bonus = (
    refid: string,
    asset: string,
    amount: string,
    amountusd: string,
  ) => ({
    refid,
    time: "2026-03-02 09:00:00",
    type: "reward",
    subtype: "welcomebonus",
    subclass: asset === "USDG" ? "stable_coin" : "crypto",
    asset,
    amount,
    amountusd,
  });

  const EXPORT = krakenCsv([
    {
      refid: "D1",
      time: "2026-03-02 08:00:00",
      type: "deposit",
      subclass: "fiat",
      asset: "EUR",
      amount: "300",
    },
    {
      refid: "B1",
      time: "2026-03-03 10:00:00",
      type: "spend",
      subclass: "fiat",
      asset: "EUR",
      amount: "-100",
      fee: "1.5",
    },
    {
      refid: "B1",
      time: "2026-03-03 10:00:00",
      type: "receive",
      subclass: "crypto",
      asset: "ETH",
      amount: "0.05",
    },
    bonus("W1", "BTC", "0.00001", "0.85"),
    bonus("W2", "SOL", "0.01", "1.40"),
    bonus("W3", "PEPE", "120000", "0.60"),
    bonus("W4", "DOGE", "5", "1.10"),
    bonus("W5", "USDG", "2", "2.00"),
    {
      refid: "E1",
      time: "2026-03-04 05:52:00",
      type: "earn",
      subtype: "reward",
      subclass: "crypto",
      asset: "ETH",
      wallet: "earn / flexible",
      amount: "0.0010",
      fee: "0.0003",
      amountusd: "3.50",
      feeusd: "1.05",
      feecurrency: "ETH",
    },
    {
      refid: "A1",
      time: "2026-03-04 06:00:00",
      type: "earn",
      subtype: "allocation",
      subclass: "crypto",
      asset: "BTC",
      amount: "-0.00001",
    },
    {
      refid: "A1",
      time: "2026-03-04 06:00:00",
      type: "earn",
      subtype: "allocation",
      subclass: "crypto",
      asset: "BTC",
      wallet: "earn / flexible",
      amount: "0.00001",
    },
    {
      refid: "X1",
      time: "2026-03-05 12:00:00",
      type: "transfer",
      subtype: "useraccounttransfer",
      subclass: "fiat",
      asset: "EUR",
      amount: "-150",
    },
  ]);

  async function run(ledger = new FakeLedgerRepository()) {
    const instruments = new FakeInstrumentRepository();
    const summary = await new KrakenCsvAdapter(
      instruments,
      ledger,
      new FakePriceRepository([]),
      async () => usd,
    ).import(EXPORT);
    return { summary, ledger, instruments };
  }

  it("imports every asset, values each reward at Kraken's figure, and moves nothing for an allocation", async () => {
    const { summary, ledger, instruments } = await run();

    expect(summary.discarded).toEqual({ "internal-move": 1 });
    expect(summary.imported).toBe(9);
    expect(instruments.upserted.map((i) => i.id).sort()).toEqual([
      "BTC",
      "DOGE",
      "ETH",
      "PEPE",
      "SOL",
      "USDG",
    ]);
    const rewards = ledger.appended.filter(
      (e) =>
        e.type === "BUY" &&
        e.note === "kraken-reward" &&
        e.valuationSource === "kraken-amountusd",
    );
    expect(rewards).toHaveLength(6);
    expect(
      rewards.every((e) => e.currency === "USD" && e.fxSource === "ECB"),
    ).toBe(true);
    const earn = ledger.appended.find((e) => e.externalId === "E1");
    expect(earn).toMatchObject({ quantity: "0.0007", grossAmount: "2.45" });
  });

  it("buys against euros net of nothing on the crypto leg, the fee on the euro one", async () => {
    const { ledger } = await run();
    expect(ledger.appended.find((e) => e.externalId === "B1")).toMatchObject({
      type: "BUY",
      instrumentId: "ETH",
      quantity: "0.05",
      grossAmount: "100",
      fees: "1.5",
      currency: "EUR",
    });
  });

  it("books a transfer to another account as a withdrawal and names it", async () => {
    const { summary, ledger } = await run();
    expect(ledger.appended.find((e) => e.externalId === "X1")).toMatchObject({
      type: "WITHDRAWAL",
      grossAmount: "150",
      note: "kraken-account-transfer",
    });
    expect(summary.noticed["account-transfer"]).toHaveLength(1);
  });

  it("points out an allocation an earlier import recorded as a reward", async () => {
    const ledger = new FakeLedgerRepository();
    ledger.appended.push({
      id: "old",
      ts: new Date("2026-03-04T06:00:00Z"),
      type: "BUY",
      instrumentId: "BTC",
      quantity: "0.00001",
      price: "80000",
      grossAmount: "0.8",
      fees: "0",
      funding: "IN_KIND",
      currency: "EUR",
      account: "kraken",
      source: "KRAKEN_CSV",
      externalId: "A1",
      note: "kraken-reward",
    });

    const { summary } = await run(ledger);

    expect(summary.noticed["internal-booked-as-reward"]).toEqual([
      {
        date: "2026-03-04T06:00:00.000Z",
        type: "earn",
        subtype: "allocation",
        instrument: "BTC",
      },
    ]);
  });
});

describe("KrakenCsvAdapter and instruments already known", () => {
  it("keeps the name an instrument already has, and names a new one by its code", async () => {
    const instruments = new FakeInstrumentRepository();
    await instruments.upsert([
      { id: "ETH", name: "Ethereum", type: "CRYPTO", thesis: "CORE" },
    ]);
    const csv = krakenCsv([
      {
        refid: "B1",
        time: "2026-03-03 10:00:00",
        type: "spend",
        subclass: "fiat",
        asset: "EUR",
        amount: "-100",
      },
      {
        refid: "B1",
        time: "2026-03-03 10:00:00",
        type: "receive",
        subclass: "crypto",
        asset: "ETH",
        amount: "0.05",
      },
      {
        refid: "B2",
        time: "2026-03-03 11:00:00",
        type: "spend",
        subclass: "fiat",
        asset: "EUR",
        amount: "-10",
      },
      {
        refid: "B2",
        time: "2026-03-03 11:00:00",
        type: "receive",
        subclass: "crypto",
        asset: "DOGE",
        amount: "50",
      },
    ]);

    const batch = await new KrakenCsvAdapter(
      instruments,
      new FakeLedgerRepository(),
    ).plan(csv);

    expect(batch.instruments.map((i) => [i.id, i.name]).sort()).toEqual([
      ["DOGE", "DOGE"],
      ["ETH", "Ethereum"],
    ]);
  });
});

describe("KrakenCsvAdapter and swaps", () => {
  const usd = rateBookFrom(
    ["2026-03-04", "2026-03-05"].map((day) => ({
      source: "ECB",
      base: "EUR",
      quote: "USD",
      day,
      rate: "1.25",
    })),
  );
  const closeOf = (instrumentId: string, price: string): PriceSnapshot => ({
    instrumentId,
    price,
    currency: "EUR",
    asOf: new Date("2026-03-03T00:00:00Z"),
    source: "YAHOO",
  });
  type Leg = Pick<
    KrakenFixtureRow,
    "asset" | "amount" | "fee" | "amountusd" | "feeusd"
  >;
  const pair = (
    refid: string,
    time: string,
    spend: Leg,
    receive: Leg,
  ): KrakenFixtureRow[] => [
    { refid, time, type: "spend", subclass: "crypto", ...spend },
    { refid, time, type: "receive", subclass: "crypto", ...receive },
  ];

  const rows: KrakenFixtureRow[] = [
    {
      refid: "D0",
      time: "2026-03-01 09:00:00",
      type: "deposit",
      subclass: "crypto",
      asset: "ETH",
      amount: "0.1",
    },
    ...pair(
      "S1",
      "2026-03-04 10:00:00",
      { asset: "ETH", amount: "-0.05", amountusd: "-165", feeusd: "0" },
      {
        asset: "BTC",
        amount: "0.0015",
        fee: "0.000003",
        amountusd: "163.5",
        feeusd: "0.33",
      },
    ),
    ...pair(
      "S2",
      "2026-03-05 10:00:00",
      {
        asset: "BTC",
        amount: "-0.001",
        fee: "0.00001",
        amountusd: "-110",
        feeusd: "1.10",
      },
      { asset: "SOL", amount: "0.5", amountusd: "109" },
    ),
    ...pair(
      "S3",
      "2026-03-06 10:00:00",
      { asset: "SOL", amount: "-0.2" },
      { asset: "DOGE", amount: "100" },
    ),
    ...pair(
      "S4",
      "2026-03-07 10:00:00",
      { asset: "DOGE", amount: "-10" },
      { asset: "PEPE", amount: "1000" },
    ),
  ];
  const EXPORT = krakenCsv(rows);

  async function run() {
    const ledger = new FakeLedgerRepository();
    const instruments = new FakeInstrumentRepository();
    const summary = await new KrakenCsvAdapter(
      instruments,
      ledger,
      new FakePriceRepository([closeOf("SOL", "150"), closeOf("DOGE", "0.2")]),
      async () => usd,
    ).import(EXPORT);
    return { summary, ledger, instruments };
  }

  it("imports each swap as two linked rows, leaves out the one it cannot value, and still reconciles the balances", async () => {
    const { summary, ledger } = await run();

    expect(summary.imported).toBe(3);
    expect(summary.discarded).toEqual({
      "crypto-transfer": 1,
      "swap-unpriced": 1,
    });
    expect(summary.discardedDetails["swap-unpriced"]).toMatchObject([
      { instrument: "DOGE → PEPE", unpriced: ["PEPE"] },
    ]);
    expect(
      ledger.appended.map((e) => [e.externalId, e.type, e.linkId]),
    ).toEqual([
      ["S1:sell", "SELL", "S1"],
      ["S1:buy", "BUY", "S1"],
      ["S2:sell", "SELL", "S2"],
      ["S2:buy", "BUY", "S2"],
      ["S3:sell", "SELL", "S3"],
      ["S3:buy", "BUY", "S3"],
    ]);
  });

  it("books each leg at the ECB rate of its day, or at the history's own currency", async () => {
    const { ledger } = await run();
    const byId = (id: string) =>
      ledger.appended.find((e) => e.externalId === id);
    expect(byId("S1:sell")).toMatchObject({
      currency: "USD",
      fxSource: "ECB",
      fxDate: "2026-03-04",
      valuationSource: "kraken-amountusd",
    });
    expect(byId("S3:sell")).toMatchObject({
      currency: "EUR",
      grossAmount: "30",
      valuationSource: "yahoo",
    });
    expect(byId("S3:buy")).toMatchObject({
      quantity: "100",
      grossAmount: "20",
      valuationSource: "yahoo",
    });
  });

  it("gives the cost of the real case: the delivered side is worth more, so both legs carry its value less the fee", async () => {
    const { ledger } = await run();
    const swap = ledger.appended.filter((e) => e.linkId === "S1");
    const trades = swap.filter(
      (e): e is Extract<LedgerEvent, { type: "BUY" | "SELL" }> =>
        e.type === "BUY" || e.type === "SELL",
    );
    const amountsOf = tradeAmounts(trades);
    const sell = trades.find((e) => e.type === "SELL")!;
    const buy = trades.find((e) => e.type === "BUY")!;

    expect(amountsOf(sell).gross.toString()).toBe("132");
    expect(amountsOf(sell).fees.toString()).toBe("0.26");
    expect(amountsOf(buy).gross.toString()).toBe("131.74");
    expect(buy.quantity).toBe("0.001497");
  });

  it("charges nothing twice when the fee was on the delivered leg", async () => {
    const { ledger } = await run();
    const trades = ledger.appended.filter(
      (e): e is Extract<LedgerEvent, { type: "BUY" | "SELL" }> =>
        e.linkId === "S2" && (e.type === "BUY" || e.type === "SELL"),
    );
    const amountsOf = tradeAmounts(trades);
    const sell = trades.find((e) => e.type === "SELL")!;
    const buy = trades.find((e) => e.type === "BUY")!;

    expect(sell.quantity).toBe("0.00101");
    expect(amountsOf(sell).gross.toString()).toBe("88.88");
    expect(amountsOf(sell).fees.toString()).toBe("0");
    expect(amountsOf(buy).gross.toString()).toBe("88.88");
  });

  it("carries both assets of the swap it set aside, so the mapping step can reach them", async () => {
    const { instruments } = await run();
    expect(instruments.upserted.map((i) => i.id).sort()).toEqual([
      "BTC",
      "DOGE",
      "ETH",
      "PEPE",
      "SOL",
    ]);
  });

  it("still refuses the file when a balance of a swap does not follow", async () => {
    const wrong = krakenCsv(
      rows.map((r) =>
        r.refid === "S1" && r.type === "receive" ? { ...r, balance: "9" } : r,
      ),
    );
    const plan = new KrakenCsvAdapter(
      new FakeInstrumentRepository(),
      new FakeLedgerRepository(),
    ).import(wrong);
    await expect(plan).rejects.toBeInstanceOf(KrakenBalanceMismatchError);
  });
});
