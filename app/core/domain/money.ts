/**
 * Money — domain placeholder.
 *
 * CORRECTNESS DECISION: money is represented as a decimal string and operated on
 * with decimal.js. NEVER as `number` (rounding errors are unacceptable in a tax
 * context). The type is branded so a bare `number` cannot pass as Money without
 * an explicit conversion.
 *
 * The real implementation (constructors, arithmetic) lands in the core step.
 */
export type Money = string & { readonly __brand: "Money" };

// TODO(core): add(a, b), sub, mul, fromString, toEUR, etc. using decimal.js
