import { createFormat, type Format } from "./format";
import { useLocale } from "./i18n";

export function useFormat(): Format {
  return createFormat(useLocale());
}
