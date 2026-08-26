import { describe, it, expect, beforeEach } from "vitest";

import type { ExposureKind, Instrument, LedgerEvent } from "~/core/domain";
import type {
  InstrumentRepository,
  LedgerEventFilter,
  LedgerRepository,
  PriceRepository,
  PriceSnapshot,
} from "~/core/ports";

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

  it("imports BTC activity and EUR cash, discarding other crypto", async () => {
    const summary = await adapter.import(CSV);

    expect(summary.total).toBe(5);
    expect(summary.imported).toBe(4);
    expect(summary.discarded).toEqual({ "non-btc": 2 });
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

    expect(summary.discarded).toEqual({ "non-btc": 2, "reward-unpriced": 1 });
    expect(summary.imported).toBe(2);
  });
});
