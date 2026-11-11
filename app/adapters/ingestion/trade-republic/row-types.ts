import type { RowTypeKey } from "../discard";

export const TRADE_REPUBLIC_ROW_TYPES: Readonly<Record<string, RowTypeKey>> = {
  INTEREST_PAYMENT: "interest",
  CUSTOMER_INPAYMENT: "deposit",
  TRANSFER_INBOUND: "transferIn",
  TRANSFER_INSTANT_INBOUND: "transferIn",
  TRANSFER_DIRECT_DEBIT_INBOUND: "directDebit",
  TRANSFER_INSTANT_OUTBOUND: "transferOut",
  BENEFITS_SAVEBACK: "saveback",
  CARD_TRANSACTION: "cardPayment",
  CARD_TRANSACTION_INTERNATIONAL: "cardPaymentAbroad",
};
