import { useState } from "react";
import { useRevalidator, useRouteLoaderData } from "react-router";

import {
  DEFAULT_LOCALE,
  intlTag,
  type Locale,
  LOCALE_COOKIE,
  LOCALE_KEYS,
  useCopy,
} from "~/lib";

import { Select } from "./Select";

const ONE_YEAR = 60 * 60 * 24 * 365;
const ENDONYM: Record<Locale, string> = { es: "Español", en: "English" };

type RootData = { locale?: Locale };

export function LocaleSetting() {
  const t = useCopy();
  const root = useRouteLoaderData("root") as RootData | undefined;
  const [locale, setLocale] = useState<Locale>(root?.locale ?? DEFAULT_LOCALE);
  const revalidator = useRevalidator();

  function select(next: string) {
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${ONE_YEAR};samesite=lax`;
    setLocale(next as Locale);
    void revalidator.revalidate();
  }

  return (
    <Select
      label={t.settings.preferences.language.label}
      value={locale}
      onChange={select}
      options={LOCALE_KEYS.map((key) => ({
        value: key,
        label: ENDONYM[key],
        desc: intlTag(key),
      }))}
    />
  );
}
