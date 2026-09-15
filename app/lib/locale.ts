export type Locale = "es" | "en";

export const LOCALE_COOKIE = "quoin-locale";
export const LOCALE_KEYS = ["es", "en"] as const;
export const DEFAULT_LOCALE: Locale = "es";

const INTL_TAGS: Record<Locale, string> = {
  es: "es-ES",
  en: "en-GB",
};

export function parseLocale(cookieHeader: string | null): Locale {
  const value = new RegExp(`${LOCALE_COOKIE}=([a-z]+)`).exec(
    cookieHeader ?? "",
  )?.[1];
  return LOCALE_KEYS.includes(value as Locale)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}

export function intlTag(locale: Locale): string {
  return INTL_TAGS[locale];
}
