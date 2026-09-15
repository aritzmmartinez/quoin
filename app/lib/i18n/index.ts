import { useRouteLoaderData } from "react-router";

import type { ExposureKind } from "~/core/domain";
import { DEFAULT_LOCALE, type Locale } from "../locale";

import { en } from "./en";
import { es } from "./es";
import type { Copy } from "./types";

export { en, es };
export type { Copy };

const COPY: Record<Locale, Copy> = { es, en };

export function copyFor(locale: Locale): Copy {
  return COPY[locale];
}

export function useLocale(): Locale {
  const root = useRouteLoaderData("root") as { locale?: Locale } | undefined;
  return root?.locale ?? DEFAULT_LOCALE;
}

export function useCopy(): Copy {
  return copyFor(useLocale());
}

export function exposureKindLabel(t: Copy, kind: string): string {
  return (
    t.labels.exposureKind[kind as ExposureKind] ?? t.labels.exposureKindFallback
  );
}

export const DASH = "—";

export function copyFromMatches(
  matches: readonly ({ loaderData?: unknown } | undefined)[],
): Copy {
  const carrier = matches.find(
    (m) =>
      typeof (m?.loaderData as { locale?: unknown } | undefined)?.locale ===
      "string",
  );
  const locale = (carrier?.loaderData as { locale?: Locale } | undefined)
    ?.locale;
  return copyFor(locale ?? DEFAULT_LOCALE);
}
