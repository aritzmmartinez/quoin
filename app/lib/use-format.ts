import { createFormat, type Format } from "./format";
import { useLocale } from "./i18n";
import { useZones } from "./use-zones";

export function useFormat(): Format {
  return createFormat(useLocale(), useZones().displayZone);
}
