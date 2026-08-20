import Decimal from "decimal.js";
import { z } from "zod";

import { decimalString } from "./ledger";
import { Money } from "./money";

export const portfolioTargetLineSchema = z.object({
  instrumentId: z.string().min(1),
  monthlyAmount: decimalString,
});
export type PortfolioTargetLine = z.infer<typeof portfolioTargetLineSchema>;

export const portfolioTargetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  activeFrom: z.date(),
  note: z.string().nullish(),
  createdAt: z.date(),
  lines: z.array(portfolioTargetLineSchema),
});
export type PortfolioTarget = z.infer<typeof portfolioTargetSchema>;

export function getActiveTarget(
  targets: readonly PortfolioTarget[],
  asOf: Date,
): PortfolioTarget | null {
  let active: PortfolioTarget | null = null;

  for (const target of targets) {
    if (target.activeFrom.getTime() > asOf.getTime()) continue;
    if (active === null) {
      active = target;
      continue;
    }
    const byActiveFrom =
      target.activeFrom.getTime() - active.activeFrom.getTime();
    const wins =
      byActiveFrom > 0 ||
      (byActiveFrom === 0 &&
        target.createdAt.getTime() > active.createdAt.getTime());
    if (wins) active = target;
  }

  return active;
}

export function monthlyTotal(target: PortfolioTarget): string {
  return target.lines
    .reduce(
      (sum, line) => sum.add(Money.fromString(line.monthlyAmount)),
      Money.zero(),
    )
    .toString();
}

export interface TargetAllocation {
  instrumentId: string;
  monthlyAmount: string;
  weight: string;
}

export function deriveTargetWeights(
  target: PortfolioTarget,
): TargetAllocation[] {
  const total = new Decimal(monthlyTotal(target));

  return target.lines.map((line) => ({
    instrumentId: line.instrumentId,
    monthlyAmount: line.monthlyAmount,
    weight: total.isZero()
      ? "0"
      : new Decimal(line.monthlyAmount).dividedBy(total).toString(),
  }));
}

export interface TargetIdMismatch {
  given: string;
  likely: string;
}

export function findIdMismatches(
  lines: readonly PortfolioTargetLine[],
  knownIds: Iterable<string>,
): TargetIdMismatch[] {
  const known = new Set(knownIds);
  const byUpper = new Map<string, string>();
  for (const id of known) byUpper.set(id.toUpperCase(), id);

  const mismatches: TargetIdMismatch[] = [];
  for (const line of lines) {
    if (known.has(line.instrumentId)) continue;
    const likely = byUpper.get(line.instrumentId.toUpperCase());
    if (likely !== undefined) {
      mismatches.push({ given: line.instrumentId, likely });
    }
  }
  return mismatches;
}

export class TargetParseError extends Error {}

export function parseTargetLines(text: string): PortfolioTargetLine[] {
  const lines: PortfolioTargetLine[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const content = raw.trim();
    if (content === "" || content.startsWith("#")) return;

    const at = `line ${index + 1}`;
    const [instrumentId, amount, ...rest] = content.split(/[\s,;]+/);
    if (instrumentId === undefined || amount === undefined || rest.length > 0) {
      throw new TargetParseError(
        `${at}: expected "<instrumentId> <monthlyAmount>", got "${content}".`,
      );
    }

    if (seen.has(instrumentId)) {
      throw new TargetParseError(
        `${at}: ${instrumentId} appears twice — one line per instrument.`,
      );
    }

    let parsed: Decimal;
    try {
      parsed = new Decimal(amount);
    } catch {
      throw new TargetParseError(`${at}: "${amount}" is not a number.`);
    }
    if (!parsed.isFinite() || parsed.lte(0)) {
      throw new TargetParseError(
        `${at}: the monthly amount must be positive, got "${amount}".`,
      );
    }

    seen.add(instrumentId);
    lines.push({ instrumentId, monthlyAmount: parsed.toString() });
  });

  return lines;
}
