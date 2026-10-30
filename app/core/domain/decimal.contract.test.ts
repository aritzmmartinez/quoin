import { readFileSync } from "node:fs";

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  DECIMAL_CONTRACT_FILE,
  decimalContractJson,
} from "../../../test/contract/decimal-contract";
import { loadContract } from "../../../test/contract/load";

import { decimalString } from "./ledger";
import { Money } from "./money";

const caseSchema = z.object({
  name: z.string(),
  op: z.enum(["parse", "add", "sub", "mul", "div", "round", "compare", "sign"]),
  a: z.string(),
  b: z.string().optional(),
  places: z.number().int().optional(),
  result: z.string().optional(),
  error: z.enum(["invalid", "division-by-zero"]).optional(),
});
type Case = z.infer<typeof caseSchema>;

const contract = loadContract(
  "decimal",
  z.object({ description: z.string(), cases: z.array(caseSchema).min(1) }),
);

function withMoney(c: Case): string {
  const a = Money.fromString(c.a);
  const b = () => Money.fromString(c.b ?? "");
  switch (c.op) {
    case "parse":
      return a.toString();
    case "add":
      return a.add(b()).toString();
    case "sub":
      return a.subtract(b()).toString();
    case "mul":
      return a.scaleBy(b().toString()).toString();
    case "div":
      return a.divideBy(b().toString()).toString();
    case "round":
      return new Decimal(a.toString())
        .toDecimalPlaces(c.places ?? 0, Decimal.ROUND_HALF_UP)
        .toFixed();
    case "compare":
      return String(a.compare(b()));
    case "sign":
      return a.isPositive() ? "1" : a.isNegative() ? "-1" : "0";
  }
}

function withDecimal(c: Case): string {
  if (!decimalString.safeParse(c.a).success) throw new Error("invalid");
  const a = new Decimal(c.a);
  const b = new Decimal(c.b ?? "0");
  switch (c.op) {
    case "parse":
      return a.toFixed();
    case "add":
      return a.plus(b).toFixed();
    case "sub":
      return a.minus(b).toFixed();
    case "mul":
      return a.times(b).toFixed();
    case "div":
      if (b.isZero()) throw new Error("division-by-zero");
      return a.dividedBy(b).toFixed();
    case "round":
      return a.toDecimalPlaces(c.places ?? 0, Decimal.ROUND_HALF_UP).toFixed();
    case "compare":
      return String(a.comparedTo(b));
    case "sign":
      return a.gt(0) ? "1" : a.lt(0) ? "-1" : "0";
  }
}

const MONEY_ERROR = {
  invalid: /Invalid money value/,
  "division-by-zero": /Money division by zero/,
};

describe("decimal contract", () => {
  it.each(contract.cases)("$name", (c) => {
    if (c.error) {
      expect(() => withMoney(c)).toThrow(MONEY_ERROR[c.error]);
      expect(() => withDecimal(c)).toThrow(c.error);
    } else {
      expect(withMoney(c)).toBe(c.result);
      expect(withDecimal(c)).toBe(c.result);
    }
  });
});

describe("decimal contract source", () => {
  it("is what test/contract/decimal-contract.ts writes", () => {
    expect(JSON.parse(readFileSync(DECIMAL_CONTRACT_FILE, "utf8"))).toEqual(
      JSON.parse(decimalContractJson()),
    );
  });
});
