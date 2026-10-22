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

import { AFFECTS_POSITION, DISCARD_REASONS } from "../discard";
import { KrakenCsvAdapter } from "./adapter";
import { KrakenBalanceMismatchError } from "./balance";
import { krakenCsv } from "./csv-fixture";

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

  it("imports BTC activity and EUR cash, setting aside assets it does not model", async () => {
    const summary = await adapter.import(CSV);

    expect(summary.total).toBe(5);
    expect(summary.imported).toBe(3);
    expect(summary.discarded).toEqual({ "unmodelled-asset": 2 });
    expect(summary.instruments).toBe(1);
    expect(instruments.upserted[0]!.id).toBe("BTC");
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
      "unmodelled-asset": 2,
      "reward-unpriced": 1,
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

    expect(summary.imported).toBe(1);
    expect(summary.discarded).toEqual({
      "unmodelled-asset": 4,
      "crypto-transfer": 2,
      "crypto-swap": 2,
      "reward-unpriced": 1,
    });
    expect(summary.discardedDetails).toEqual({
      "unmodelled-asset": [
        detail("2026-01-11T05:52:10.000Z", "earn", "reward", "SOL"),
        detail("2026-01-12T05:52:40.000Z", "reward", "welcomebonus", "ETH"),
        detail("2026-02-04T09:00:00.000Z", "deposit", null, "ETH"),
        detail("2026-02-12T12:00:00.000Z", "receive", null, "EUR → ETH"),
      ],
      "crypto-transfer": [
        detail("2026-02-01T09:00:00.000Z", "deposit", null, "BTC"),
        detail("2026-02-03T09:00:00.000Z", "withdrawal", null, "BTC"),
      ],
      "crypto-swap": [
        detail("2026-02-10T12:00:00.000Z", "receive", null, "ETH → BTC"),
        detail("2026-02-11T12:00:00.000Z", "receive", null, "BTC → SOL"),
      ],
      "reward-unpriced": [
        detail("2026-03-01T05:52:00.000Z", "reward", null, "BTC"),
      ],
    });
  });

  it("flags exactly the reasons that leave a modelled position wrong", () => {
    expect(
      DISCARD_REASONS.filter((reason) => AFFECTS_POSITION[reason]),
    ).toEqual([
      "crypto-swap",
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
