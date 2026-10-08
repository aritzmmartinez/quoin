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
  PriceRepository,
  PriceSnapshot,
} from "~/core/ports";

import { AFFECTS_POSITION, DISCARD_REASONS } from "../discard";
import { KrakenCsvAdapter } from "./adapter";

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
}

class FakePriceRepository implements PriceRepository {
  constructor(private readonly snapshots: PriceSnapshot[] = []) {}
  async saveMany(): Promise<number> {
    return 0;
  }
  async latest(): Promise<Map<string, PriceSnapshot>> {
    return new Map();
  }
  async deleteForInstrument(): Promise<number> {
    return 0;
  }
  async historyFor(instrumentId: string): Promise<PriceSnapshot[]> {
    return this.snapshots.filter((s) => s.instrumentId === instrumentId);
  }
}

const HEADER =
  "txid,refid,time,type,subtype,aclass,subclass,asset,wallet,amount,fee,balance";

const CSV = [
  HEADER,
  `"x1","T1","2025-11-13 18:04:48","spend","","currency","fiat","EUR","spot / main",-150.0000,0,0.0`,
  `"x2","T1","2025-11-13 18:04:48","receive","","currency","crypto","BTC","spot / main",0.0030000000,0,0.003`,
  `"x3","D1","2025-11-17 13:38:00","deposit","","currency","fiat","EUR","spot / main",500.0000,0,500.0`,
  `"x4","RW1","2025-11-25 23:25:20","reward","welcomebonus","currency","crypto","BTC","spot / main",0.0000057100,0,0.003`,
  `"x5","RW2","2025-11-14 00:06:13","reward","welcomebonus","currency","crypto","SOL","spot / main",0.0017288700,0,0.001`,
  `"x6","S1","2025-11-20 11:55:11","spend","","currency","crypto","PEPE","spot / main",-629732.00,0,0.68`,
  `"x7","S1","2025-11-20 11:55:11","receive","","currency","crypto","SOL","spot / main",0.0208900000,0,0.02`,
].join("\n");

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
      new FakePriceRepository([btcAt("2025-11-25T00:00:00Z", "80000")]),
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

describe("KrakenCsvAdapter discards", () => {
  const MIXED = [
    HEADER,
    `"m1","B1","2026-01-05 10:00:00","spend","","currency","fiat","EUR","spot / main",-100.0000,0,0`,
    `"m2","B1","2026-01-05 10:00:00","receive","","currency","crypto","BTC","spot / main",0.0010000000,0,0.001`,
    `"m3","E1","2026-01-11 05:52:10","earn","reward","currency","crypto","SOL","earn / flexible",0.0004000000,0,0.01`,
    `"m4","E2","2026-01-12 05:52:40","reward","welcomebonus","currency","crypto","ETH","spot / main",0.0002000000,0,0.0002`,
    `"m5","D1","2026-02-01 09:00:00","deposit","","currency","crypto","BTC","spot / main",0.0050000000,0,0.006`,
    `"m6","W1","2026-02-03 09:00:00","withdrawal","","currency","crypto","BTC","spot / main",-0.0020000000,0.00001,0.004`,
    `"m7","D2","2026-02-04 09:00:00","deposit","","currency","crypto","ETH","spot / main",0.1000000000,0,0.1002`,
    `"m8","S1","2026-02-10 12:00:00","spend","","currency","crypto","ETH","spot / main",-0.0500000000,0,0.0502`,
    `"m9","S1","2026-02-10 12:00:00","receive","","currency","crypto","BTC","spot / main",0.0015000000,0.000003,0.0055`,
    `"m10","S2","2026-02-11 12:00:00","spend","","currency","crypto","BTC","spot / main",-0.0010000000,0,0.0045`,
    `"m11","S2","2026-02-11 12:00:00","receive","","currency","crypto","SOL","spot / main",0.4000000000,0.001,0.41`,
    `"m12","T1","2026-02-12 12:00:00","spend","","currency","fiat","EUR","spot / main",-50.0000,0,0`,
    `"m13","T1","2026-02-12 12:00:00","receive","","currency","crypto","ETH","spot / main",0.0200000000,0,0.07`,
    `"m14","R1","2026-03-01 05:52:00","reward","","currency","crypto","BTC","spot / main",0.0000010000,0,0.0045`,
  ].join("\n");

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
    ).toEqual(["crypto-swap", "crypto-transfer", "reward-unpriced"]);
  });
});
