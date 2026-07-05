export type Sleeve = "CORE" | "TRADING";

export type InstrumentType =
  | "ETF"
  | "STOCK"
  | "CRYPTO"
  | "BOND"
  | "COMMODITY"
  | "CASH";

export interface Instrument {
  id: string;
  name: string;
  type: InstrumentType;
  currency: string;
  assetClass?: string | null;
}

interface LedgerEventBase {
  id: string;
  ts: Date;
  currency: string;
  fxToBase: string;
  account: string;
  source: string;
  externalId?: string | null;
  note?: string | null;
}

export interface TradeEvent extends LedgerEventBase {
  type: "BUY" | "SELL";
  instrumentId: string;
  sleeve: Sleeve;
  quantity: string;
  price: string;
  grossAmount: string;
  fees: string;
}

export interface DividendEvent extends LedgerEventBase {
  type: "DIVIDEND";
  instrumentId: string;
  sleeve: Sleeve | null;
  grossAmount: string;
  taxWithheld: string;
}

export interface CashEvent extends LedgerEventBase {
  type: "DEPOSIT" | "WITHDRAWAL" | "INTEREST";
  grossAmount: string;
}

export type LedgerEvent = TradeEvent | DividendEvent | CashEvent;

export type LedgerEventType = LedgerEvent["type"];
