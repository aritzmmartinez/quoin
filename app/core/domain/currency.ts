import { z } from "zod";

export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{3,10}$/, "must be an upper-case currency code");

export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
