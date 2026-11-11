import type { RowTypeKey } from "../discard";

export const KRAKEN_ROW_TYPES: Readonly<Record<string, RowTypeKey>> = {
  deposit: "deposit",
  withdrawal: "withdrawal",
  transfer: "transfer",
  reward: "reward",
  earn: "earn",
  hybridearnwithdrawal: "earnWithdrawal",
  spend: "spend",
  receive: "receive",
  trade: "trade",
};
