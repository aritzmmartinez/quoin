export const DISCARD_REASONS = [
  "swap-unpriced",
  "crypto-transfer",
  "reward-unpriced",
  "fx-unavailable",
  "invalid-crypto-code",
  "earn-return-unverified",
  "internal-move",
  "card-spending",
  "saveback-unpaired",
  "unsupported-asset-class",
  "unsupported",
] as const;

export type DiscardReason = (typeof DISCARD_REASONS)[number];

export const AFFECTS_POSITION: Record<DiscardReason, boolean> = {
  "swap-unpriced": true,
  "crypto-transfer": true,
  "reward-unpriced": true,
  "fx-unavailable": true,
  "invalid-crypto-code": true,
  "earn-return-unverified": true,
  "internal-move": false,
  "card-spending": false,
  "saveback-unpaired": false,
  "unsupported-asset-class": true,
  unsupported: false,
};

export const NOTICE_REASONS = [
  "account-transfer",
  "internal-booked-as-reward",
] as const;

export type NoticeReason = (typeof NOTICE_REASONS)[number];

export interface DiscardDetail {
  date: string;
  type: string;
  subtype: string | null;
  instrument: string | null;
  unpriced?: string[];
  affectsPosition?: boolean;
}

export const ROW_ERROR_REASONS = [
  "invalid-date",
  "invalid-number",
  "missing-instrument",
  "wrong-field-count",
  "unexpected",
] as const;

export type RowErrorReason = (typeof ROW_ERROR_REASONS)[number];

export interface RowRef {
  externalId: string | null;
  position: number | null;
  date: string | null;
  type: string | null;
}

export interface RowError extends RowRef {
  reason: RowErrorReason;
}

export const FILE_ERROR_REASONS = [
  "invalid-encoding",
  "unparseable",
  "missing-column",
  "invalid-number",
  "wrong-field-count",
] as const;

export type FileErrorReason = (typeof FILE_ERROR_REASONS)[number];
