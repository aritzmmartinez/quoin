import { FISCAL_TIME_ZONE } from "./config";

const YEAR_IN_MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: FISCAL_TIME_ZONE,
  year: "numeric",
});

export function fiscalYearOf(date: Date): number {
  return Number(YEAR_IN_MADRID.format(date));
}
