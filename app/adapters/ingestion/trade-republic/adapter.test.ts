import { describe, it, expect, beforeEach } from "vitest";

import type { ExposureKind, Instrument, LedgerEvent } from "~/core/domain";
import type {
  InstrumentRepository,
  LedgerEventFilter,
  LedgerRepository,
} from "~/core/ports";

import { TradeRepublicCsvAdapter } from "./adapter";

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
  private seen = new Set<string>();
  async append(events: readonly LedgerEvent[]) {
    let inserted = 0;
    let skipped = 0;
    for (const event of events) {
      const key = `${event.source}::${event.externalId}`;
      if (event.externalId && this.seen.has(key)) {
        skipped++;
      } else {
        if (event.externalId) this.seen.add(key);
        this.appended.push(event);
        inserted++;
      }
    }
    return { inserted, skipped };
  }
  async list(_filter?: LedgerEventFilter): Promise<LedgerEvent[]> {
    return this.appended;
  }
}

const HEADER =
  "datetime,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,transaction_id";

const CSV = [
  HEADER,
  `"2025-01-01T10:00:00Z","TRADING","BUY","FUND","World ETF","IE00AAA","1","100","-100","","","EUR","t1"`,
  `"2025-01-02T10:00:00Z","TRADING","BUY","FUND","World ETF","IE00AAA","1","110","-110","","","EUR","t2"`,
  `"2025-01-03T10:00:00Z","TRADING","BUY","STOCK","Some Stock","US000AAA","2","50","-100","-1","","EUR","t3"`,
  `"2025-01-04T10:00:00Z","CASH","DIVIDEND","STOCK","Some Stock","US000AAA","","","3.50","","-0.50","EUR","t4"`,
  `"2025-01-05T10:00:00Z","CASH","CUSTOMER_INPAYMENT","","","","","","500","","","EUR","t5"`,
  `"2025-01-06T10:00:00Z","CASH","CARD_TRANSACTION","","Eroski","","","","-9.99","","","EUR","t6"`,
  `"2025-01-07T10:00:00Z","CASH","BENEFITS_SAVEBACK","","","","","","0.10","","","EUR","t7"`,
].join("\n");

describe("TradeRepublicCsvAdapter", () => {
  let instruments: FakeInstrumentRepository;
  let ledger: FakeLedgerRepository;
  let adapter: TradeRepublicCsvAdapter;

  beforeEach(() => {
    instruments = new FakeInstrumentRepository();
    ledger = new FakeLedgerRepository();
    adapter = new TradeRepublicCsvAdapter(instruments, ledger);
  });

  it("imports a mixed CSV, discarding card spending and unsupported rows", async () => {
    const summary = await adapter.import(CSV);

    expect(summary.total).toBe(7);
    expect(summary.imported).toBe(5);
    expect(summary.duplicates).toBe(0);
    expect(summary.discarded).toEqual({ "card-spending": 1, unsupported: 1 });
    expect(summary.errors).toBe(0);
    expect(summary.instruments).toBe(2);
    expect(instruments.upserted).toHaveLength(2);
    expect(ledger.appended).toHaveLength(5);
  });

  it("is idempotent: re-importing the same CSV inserts nothing new", async () => {
    await adapter.import(CSV);
    const second = await adapter.import(CSV);

    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(5);
    expect(ledger.appended).toHaveLength(5);
  });
});
