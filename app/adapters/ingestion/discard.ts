export const DISCARD_REASONS = [
  "crypto-swap",
  "crypto-transfer",
  "reward-unpriced",
  "fx-unavailable",
  "invalid-crypto-code",
  "internal-move",
  "card-spending",
  "saveback-unpaired",
  "unsupported",
] as const;

export type DiscardReason = (typeof DISCARD_REASONS)[number];

export const AFFECTS_POSITION: Record<DiscardReason, boolean> = {
  "crypto-swap": true,
  "crypto-transfer": true,
  "reward-unpriced": true,
  "fx-unavailable": true,
  "invalid-crypto-code": true,
  "internal-move": false,
  "card-spending": false,
  "saveback-unpaired": false,
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
}
