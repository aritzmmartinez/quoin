import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
} from "~/core/ports";

import { rateBookFrom } from "~/core/fx";

import { BatchBuilder, InvalidLedgerEventError, previewBatch } from "../ingest";
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
  private seen = new Set<string>();
  async existing(events: readonly LedgerEvent[]): Promise<Set<string>> {
    return new Set(
      events
        .filter((e) => e.externalId)
        .map((e) => `${e.source}::${e.externalId}`)
        .filter((key) => this.seen.has(key)),
    );
  }
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
  async markInKind(events: readonly LedgerEvent[]): Promise<number> {
    let changed = 0;
    for (const event of events) {
      if (!("funding" in event) || event.funding !== "IN_KIND") continue;
      this.appended = this.appended.map((stored) => {
        const same =
          stored.source === event.source &&
          stored.externalId === event.externalId &&
          stored.type === event.type;
        if (!same || ("funding" in stored && stored.funding === "IN_KIND"))
          return stored;
        changed++;
        return { ...stored, funding: "IN_KIND" } as LedgerEvent;
      });
    }
    return changed;
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
    expect(summary.discarded).toEqual({
      "card-spending": 1,
      "saveback-unpaired": 1,
    });
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

  const SAVEBACK_CSV = [
    HEADER,
    `"2025-06-02T08:00:00Z","CASH","BENEFITS_SAVEBACK","","Test ETF","IE00AAA","","","1.000000","","","EUR","s-old"`,
    `"2025-06-02T08:04:00Z","TRADING","BUY","FUND","Test ETF","IE00AAA","0.01","100","-1.00","","-0.19","EUR","b-old"`,
    `"2026-01-02T05:30:00Z","CASH","BENEFITS_SAVEBACK","","","","","","2.000000","","-0.380000","EUR","s-new"`,
    `"2026-01-05T09:00:00Z","TRADING","BUY","FUND","Test ETF","IE00AAA","0.0162","100","-1.62","","","EUR","b-new"`,
  ].join("\n");

  const found = (externalId: string) =>
    ledger.appended.find((e) => e.externalId === externalId);

  it("books a paired saveback as an in-kind purchase plus in-kind income, in both regimes", async () => {
    const summary = await adapter.import(SAVEBACK_CSV);

    expect(summary.imported).toBe(2);
    expect(summary.discarded).toEqual({});
    for (const [buy, income, gross, tax] of [
      ["b-old", "s-old", "1", "0.19"],
      ["b-new", "s-new", "2", "0.38"],
    ] as const) {
      expect(found(buy)).toMatchObject({ type: "BUY", funding: "IN_KIND" });
      expect(found(income)).toMatchObject({
        type: "DIVIDEND",
        instrumentId: "IE00AAA",
        grossAmount: gross,
        taxWithheld: tax,
        funding: "IN_KIND",
      });
    }
  });

  it("keeps the purchase's amount and fee exactly as the file states them", async () => {
    await adapter.import(SAVEBACK_CSV);
    expect(found("b-old")).toMatchObject({ grossAmount: "1", fees: "0" });
    expect(found("b-new")).toMatchObject({ grossAmount: "1.62", fees: "0" });
  });

  it("marks a purchase already stored as CASH when a re-import finds its saveback", async () => {
    const purchasesOnly = SAVEBACK_CSV.split("\n")
      .filter((line) => !line.includes("BENEFITS_SAVEBACK"))
      .join("\n");
    await adapter.import(purchasesOnly);
    expect(found("b-old")).not.toHaveProperty("funding", "IN_KIND");

    await adapter.import(SAVEBACK_CSV);
    expect(found("b-old")).toMatchObject({ funding: "IN_KIND" });
    expect(found("s-old")).toMatchObject({ funding: "IN_KIND" });
    expect(
      ledger.appended.filter((e) => e.externalId === "b-old"),
    ).toHaveLength(1);
  });
});

describe("TradeRepublicCsvAdapter with the original amount columns", () => {
  const WIDE_HEADER = `${HEADER},original_amount,original_currency,fx_rate`;

  it("keeps a row's original amount and currency when the export carries them", async () => {
    const ledger = new FakeLedgerRepository();
    const adapter = new TradeRepublicCsvAdapter(
      new FakeInstrumentRepository(),
      ledger,
    );

    await adapter.import(
      [
        WIDE_HEADER,
        `"2025-03-03T10:00:00Z","TRADING","BUY","STOCK","Some Stock","US000AAA","2","45","-90","-1","","EUR","o1","-99.99","USD","1.111000"`,
        `"2025-03-04T10:00:00Z","TRADING","BUY","FUND","World ETF","IE00AAA","1","100","-100","","","EUR","o2","","",""`,
      ].join("\n"),
    );

    const [withOriginals, without] = ledger.appended;
    expect(withOriginals).toMatchObject({
      currency: "EUR",
      grossAmount: "90",
      originalAmount: "99.99",
      originalCurrency: "USD",
    });
    expect(withOriginals?.fxSource ?? "IDENTITY").toBe("IDENTITY");
    expect(without?.originalAmount).toBeUndefined();
    expect(without?.originalCurrency).toBeUndefined();
  });

  it("still sets an international card payment aside as card spending", async () => {
    const adapter = new TradeRepublicCsvAdapter(
      new FakeInstrumentRepository(),
      new FakeLedgerRepository(),
    );

    const summary = await adapter.import(
      [
        WIDE_HEADER,
        `"2025-03-05T10:00:00Z","CASH","CARD_TRANSACTION_INTERNATIONAL","","Shop","","","","-9.99","","","EUR","c1","-10.99","USD","1.100000"`,
      ].join("\n"),
    );

    expect(summary.imported).toBe(0);
    expect(summary.discarded).toEqual({ "card-spending": 1 });
  });
});

describe("TradeRepublicCsvAdapter with a row in another currency", () => {
  const FOREIGN_CSV = [
    HEADER,
    `"2025-01-01T10:00:00Z","TRADING","BUY","FUND","World ETF","IE00AAA","1","100","-100","","","EUR","t1"`,
    `"2025-01-02T10:00:00Z","TRADING","BUY","STOCK","Some Stock","US000AAA","2","50","-100","-1","","USD","t2"`,
    `"2025-01-05T10:00:00Z","CASH","CUSTOMER_INPAYMENT","","","","","","500","","","EUR","t3"`,
  ].join("\n");

  let instruments: FakeInstrumentRepository;
  let ledger: FakeLedgerRepository;
  let adapter: TradeRepublicCsvAdapter;

  beforeEach(() => {
    instruments = new FakeInstrumentRepository();
    ledger = new FakeLedgerRepository();
    adapter = new TradeRepublicCsvAdapter(instruments, ledger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts that row at the ECB rate of its day when the rate is stored", async () => {
    const asked: string[][] = [];
    const converting = new TradeRepublicCsvAdapter(
      instruments,
      ledger,
      async (currencies) => {
        asked.push([...currencies]);
        return rateBookFrom([
          { source: "ECB", base: "EUR", quote: "USD", day: "2025-01-02", rate: "1.04" },
        ]);
      },
    );

    const summary = await converting.import(FOREIGN_CSV);

    expect(asked).toEqual([["USD"]]);
    expect(summary.imported).toBe(3);
    expect(summary.discarded).toEqual({});
    expect(ledger.appended.find((e) => e.externalId === "t2")).toMatchObject({
      currency: "USD",
      grossAmount: "100",
      fees: "1",
      fxSource: "ECB",
      fxRate: "1.04",
      fxDirection: "QUOTE_PER_BASE",
      fxDate: "2025-01-02",
    });
  });

  it("sets that row aside as fx-unavailable with no rate, imports the rest and says what it needs", async () => {
    const batch = await adapter.plan(FOREIGN_CSV);
    expect(batch.ratesNeeded).toEqual(new Map([["USD", "2025-01-02"]]));

    const summary = await adapter.import(FOREIGN_CSV);

    expect(summary.imported).toBe(2);
    expect(summary.discarded).toEqual({ "fx-unavailable": 1 });
    expect(summary.discardedDetails["fx-unavailable"]).toEqual([
      {
        date: "2025-01-02T10:00:00.000Z",
        type: "BUY",
        subtype: null,
        instrument: "Some Stock (USD)",
      },
    ]);
    expect(ledger.appended.map((e) => e.externalId)).toEqual(["t1", "t3"]);
    expect(instruments.upserted.map((i) => i.id)).toEqual(["IE00AAA"]);
  });

  it("previews exactly what it then imports", async () => {
    const preview = await previewBatch(ledger, await adapter.plan(FOREIGN_CSV));
    const imported = await adapter.import(FOREIGN_CSV);

    expect(preview).toEqual(imported);
  });

  it("writes nothing at all, instruments included, when a row breaks the rule otherwise", async () => {
    vi.spyOn(BatchBuilder.prototype, "build").mockImplementation(() => {
      throw new InvalidLedgerEventError("2025-01-02", "BUY", "USD");
    });

    await expect(adapter.import(FOREIGN_CSV)).rejects.toBeInstanceOf(
      InvalidLedgerEventError,
    );
    expect(instruments.upserted).toEqual([]);
    expect(ledger.appended).toEqual([]);
  });
});

describe("TradeRepublicCsvAdapter with crypto", () => {
  const CRYPTO_CSV = [
    HEADER,
    `"2026-01-02T05:30:00Z","CASH","BENEFITS_SAVEBACK","","Bitcoin","BTC","","","2.000000","","-0.380000","EUR","s-btc"`,
    `"2026-01-05T09:00:00Z","TRADING","BUY","CRYPTO","Bitcoin","BTC","0.00003","54000","-1.62","","","EUR","b-btc"`,
    `"2026-02-02T05:30:00Z","CASH","BENEFITS_SAVEBACK","","Bitcoin","XF000BTC0017","","","2.000000","","-0.380000","EUR","s-bad"`,
    `"2026-02-05T09:00:00Z","TRADING","BUY","CRYPTO","Bitcoin","XF000BTC0017","0.00003","54000","-1.62","","","EUR","b-bad"`,
    `"2026-03-01T10:00:00Z","TRADING","SELL","CRYPTO","Bitcoin","XF000BTC0017","0.00001","50000","0.50","","","EUR","t-bad"`,
    `"2026-03-02T10:00:00Z","TRADING","SELL","CRYPTO","Bitcoin","BTC","0.00001","50000","0.50","","","EUR","t-btc"`,
  ].join("\n");

  it("books crypto under its asset code, a paired saveback included", async () => {
    const ledger = new FakeLedgerRepository();
    await new TradeRepublicCsvAdapter(
      new FakeInstrumentRepository(),
      ledger,
    ).import(CRYPTO_CSV);

    for (const id of ["s-btc", "b-btc", "t-btc"]) {
      expect(ledger.appended.find((e) => e.externalId === id)).toMatchObject({
        instrumentId: "BTC",
      });
    }
  });

  it("sets aside each row with an invalid code by name and imports the rest", async () => {
    const instruments = new FakeInstrumentRepository();
    const ledger = new FakeLedgerRepository();

    const summary = await new TradeRepublicCsvAdapter(
      instruments,
      ledger,
    ).import(CRYPTO_CSV);

    expect(summary.imported).toBe(2);
    expect(summary.errors).toBe(0);
    expect(summary.discarded).toEqual({ "invalid-crypto-code": 2 });
    expect(
      summary.discardedDetails["invalid-crypto-code"]?.map((d) => d.instrument),
    ).toEqual(["XF000BTC0017", "XF000BTC0017"]);
    expect(instruments.upserted.map((i) => i.id)).toEqual(["BTC"]);
    expect(ledger.appended.map((e) => e.externalId).sort()).toEqual([
      "b-btc",
      "s-btc",
      "t-btc",
    ]);
  });
});
